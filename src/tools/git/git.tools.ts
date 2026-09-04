import { spawn } from 'node:child_process'
import { resolve, relative } from 'node:path'
import { toolRegistry, type ToolContext, type ToolRegistry, type ToolResult } from '../registry/tool.registry.js'

function safePath(value: unknown, context: ToolContext): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing path')
  const workspace = resolve(context.workspacePath)
  const path = resolve(workspace, value)
  if (relative(workspace, path).startsWith('..')) throw new Error(`Path outside workspace: ${value}`)
  return path
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolvePromise(stdout) : reject(new Error(stderr.trim() || `git exited with code ${code ?? 1}`)))
  })
}

async function statusHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const output = await runGit(['status', '--porcelain'], safePath(params.path, context))
    const result = { staged: [] as string[], unstaged: [] as string[], untracked: [] as string[] }
    for (const line of output.split('\n').filter(Boolean)) {
      const path = line.slice(3).trim()
      if (line.startsWith('??')) result.untracked.push(path)
      else {
        if (line[0] !== ' ') result.staged.push(path)
        if (line[1] !== ' ') result.unstaged.push(path)
      }
    }
    return { success: true, output: result }
  } catch (error) { return { success: false, output: null, error: error instanceof Error ? error.message : 'Git status failed' } }
}

async function logHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(params.limit, 100)) : 20
    const output = await runGit(['log', '--oneline', '-n', String(limit)], safePath(params.path, context))
    return { success: true, output: output.split('\n').filter(Boolean).map(line => ({ hash: line.split(' ')[0] ?? '', message: line.split(' ').slice(1).join(' ') })) }
  } catch (error) { return { success: false, output: null, error: error instanceof Error ? error.message : 'Git log failed' } }
}

async function diffHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const args = ['diff']
    if (typeof params.file === 'string' && params.file) args.push('--', params.file)
    const output = await runGit(args, safePath(params.path, context))
    return { success: true, output: output.length > 10000 ? `${output.slice(0, 10000)}\n[Parallax] Diff truncated.` : output, truncated: output.length > 10000 }
  } catch (error) { return { success: false, output: null, error: error instanceof Error ? error.message : 'Git diff failed' } }
}

export function registerGitTools(registry: ToolRegistry): void {
  const properties = { path: { type: 'string', description: 'Workspace-relative repository path.' } }
  registry.register({ name: 'git_status', description: 'Read repository status.', permission_level: 'READ_ONLY', timeout_ms: 15000, input_schema: { type: 'object', properties, required: ['path'] }, handler: statusHandler })
  registry.register({ name: 'git_log', description: 'Read recent repository commits.', permission_level: 'READ_ONLY', timeout_ms: 15000, input_schema: { type: 'object', properties: { ...properties, limit: { type: 'number', description: 'Maximum commits.' } }, required: ['path'] }, handler: logHandler })
  registry.register({ name: 'git_diff', description: 'Read repository changes.', permission_level: 'READ_ONLY', timeout_ms: 15000, input_schema: { type: 'object', properties: { ...properties, file: { type: 'string', description: 'Optional file path.' } }, required: ['path'] }, handler: diffHandler })
}