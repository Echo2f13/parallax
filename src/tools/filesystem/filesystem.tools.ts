import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, join } from 'node:path'
import { toolRegistry, type ToolContext, type ToolDefinition, type ToolRegistry, type ToolResult } from '../registry/tool.registry.js'

function stringParam(params: Record<string, unknown>, name: string): string {
  const value = params[name]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing string parameter: ${name}`)
  return value
}

function safePath(value: string, context: ToolContext): string {
  const workspace = resolve(context.workspacePath)
  const candidate = resolve(workspace, value)
  if (relative(workspace, candidate).startsWith('..')) throw new Error(`Path outside workspace: ${value}`)
  return candidate
}

async function readFileHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const path = safePath(stringParam(params, 'path'), context)
    const encoding = typeof params.encoding === 'string' ? params.encoding : 'utf8'
    return { success: true, output: await readFile(path, { encoding: encoding as BufferEncoding }) }
  } catch (error) {
    return { success: false, output: null, error: error instanceof Error ? error.message : 'File could not be read' }
  }
}

interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
}

async function listDirectoryHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const root = safePath(stringParam(params, 'path'), context)
    const recursive = params.recursive === true
    const entries: DirectoryEntry[] = []
    async function visit(directory: string, depth: number): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name)
        if (entry.isDirectory()) {
          entries.push({ name: entry.name, type: 'directory', path: entryPath })
          if (recursive && depth < 3) await visit(entryPath, depth + 1)
        } else if (entry.isFile()) {
          const metadata = await stat(entryPath)
          entries.push({ name: entry.name, type: 'file', size: metadata.size, path: entryPath })
        }
      }
    }
    await visit(root, 0)
    return { success: true, output: entries }
  } catch (error) {
    return { success: false, output: null, error: error instanceof Error ? error.message : 'Directory could not be listed' }
  }
}

async function searchFilesHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  try {
    const pattern = stringParam(params, 'pattern')
    const root = safePath(stringParam(params, 'path'), context)
    const extension = typeof params.file_extension === 'string' ? params.file_extension : undefined
    const matches: string[] = []
    async function visit(directory: string, depth: number): Promise<void> {
      if (depth > 3) return
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name)
        if (entry.isDirectory()) await visit(entryPath, depth + 1)
        else if (entry.isFile() && entry.name.includes(pattern) && (!extension || entry.name.endsWith(extension))) matches.push(entryPath)
      }
    }
    await visit(root, 0)
    return { success: true, output: matches }
  } catch (error) {
    return { success: false, output: null, error: error instanceof Error ? error.message : 'Files could not be searched' }
  }
}

export function registerFilesystemTools(registry: ToolRegistry): void {
  const base = (name: string, description: string, timeout_ms: number, properties: ToolDefinition['input_schema']['properties'], required: string[], handler: ToolDefinition['handler']): void => {
    registry.register({ name, description, permission_level: 'READ_ONLY', timeout_ms, input_schema: { type: 'object', properties, required }, handler })
  }
  base('read_file', 'Read a file from the workspace.', 10000, {
    path: { type: 'string', description: 'File path relative to the workspace.' },
    encoding: { type: 'string', description: 'Optional text encoding.' },
  }, ['path'], readFileHandler)
  base('list_directory', 'List files and directories in the workspace.', 10000, {
    path: { type: 'string', description: 'Directory path relative to the workspace.' },
    recursive: { type: 'boolean', description: 'Whether to recurse up to three levels.' },
  }, ['path'], listDirectoryHandler)
  base('search_files', 'Find files by name in the workspace.', 15000, {
    pattern: { type: 'string', description: 'Text contained in the filename.' },
    path: { type: 'string', description: 'Directory path relative to the workspace.' },
    file_extension: { type: 'string', description: 'Optional filename extension filter.' },
  }, ['pattern', 'path'], searchFilesHandler)
}

export function ensureFilesystemToolsRegistered(): void {
  registerFilesystemTools(toolRegistry)
}