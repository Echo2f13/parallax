import { readdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve, relative } from 'node:path'
import { toolRegistry, type ToolContext, type ToolRegistry, type ToolResult } from '../registry/tool.registry.js'

interface SearchResult {
  file: string
  line_number: number
  line_content: string
  context_before: string[]
  context_after: string[]
}

function param(params: Record<string, unknown>, name: string): string {
  const value = params[name]
  if (typeof value !== 'string' || !value) throw new Error(`Missing string parameter: ${name}`)
  return value
}

function safePath(path: string, context: ToolContext): string {
  const workspace = resolve(context.workspacePath)
  const candidate = resolve(workspace, path)
  if (relative(workspace, candidate).startsWith('..')) throw new Error(`Path outside workspace: ${path}`)
  return candidate
}

function runRipgrep(args: string[], cwd: string): Promise<SearchResult[]> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('rg', args, { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0 && code !== 1) {
        reject(new Error(stderr || `rg exited with code ${code ?? 1}`))
        return
      }
      const results: SearchResult[] = []
      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const record: unknown = JSON.parse(line)
          if (typeof record !== 'object' || record === null || !('type' in record) || record.type !== 'match' || !('data' in record)) continue
          const data = record.data
          if (typeof data !== 'object' || data === null || !('path' in data) || !('line_number' in data) || !('lines' in data)) continue
          const path = data.path
          const lineNumber = data.line_number
          const lines = data.lines
          if (typeof path !== 'object' || path === null || !('text' in path) || typeof path.text !== 'string' || typeof lineNumber !== 'number' || typeof lines !== 'object' || lines === null || !('text' in lines) || typeof lines.text !== 'string') continue
          results.push({ file: path.text, line_number: lineNumber, line_content: lines.text.trimEnd(), context_before: [], context_after: [] })
        } catch {
          continue
        }
      }
      resolvePromise(results)
    })
  })
}

async function fallbackSearch(root: string, query: string, extension: string | undefined, maxResults: number): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  async function visit(directory: string): Promise<void> {
    if (results.length >= maxResults) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (results.length >= maxResults) return
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) {
        const lines = (await readFile(path, 'utf8')).split('\n')
        lines.forEach((line, index) => {
          if (results.length < maxResults && line.includes(query)) results.push({ file: path, line_number: index + 1, line_content: line, context_before: lines.slice(Math.max(0, index - 2), index), context_after: lines.slice(index + 1, index + 3) })
        })
      }
    }
  }
  await visit(root)
  return results
}

async function searchHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const query = param(params, 'query')
    const root = safePath(param(params, 'path'), context)
    const extension = typeof params.file_extension === 'string' ? params.file_extension : undefined
    const maxResults = typeof params.max_results === 'number' ? Math.min(Math.max(params.max_results, 1), 100) : 100
    try {
      const args = ['--json', '-n', '--max-count', String(maxResults)]
      if (extension) args.push('--glob', `*${extension}`)
      args.push(query, root)
      return { success: true, output: (await runRipgrep(args, context.workspacePath)).slice(0, maxResults) }
    } catch {
      return { success: true, output: await fallbackSearch(root, query, extension, maxResults) }
    }
  } catch (error) {
    return { success: false, output: null, error: error instanceof Error ? error.message : 'Code search failed' }
  }
}

export function registerSearchTools(registry: ToolRegistry): void {
  registry.register({
    name: 'search_code',
    description: 'Search source files for matching code.',
    permission_level: 'READ_ONLY',
    timeout_ms: 20000,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or regular expression to search for.' },
        path: { type: 'string', description: 'Workspace-relative search path.' },
        file_extension: { type: 'string', description: 'Optional extension filter.' },
        max_results: { type: 'number', description: 'Maximum number of results, up to 100.' },
      },
      required: ['query', 'path'],
    },
    handler: searchHandler,
  })
}