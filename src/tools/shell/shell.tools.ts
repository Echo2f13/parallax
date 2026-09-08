import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { config } from '../../config/config.js'
import { toolRegistry, type ToolContext, type ToolRegistry, type ToolResult } from '../registry/tool.registry.js'

const forbiddenTokens = new Set(['rm', 'rmdir', 'del', 'rd', 'format', 'mkfs', 'fdisk', 'dd'])
const forbiddenSubstrings = ['DROP TABLE', 'DELETE FROM', 'TRUNCATE TABLE', ':(){:|:&};:']

function isForbidden(command: string): boolean {
  if (forbiddenSubstrings.some(fragment => command.toUpperCase().includes(fragment.toUpperCase()))) return true
  return command.trim().split(/\s+/).some(token => forbiddenTokens.has(token.toLowerCase()))
}

function executeCommand(command: string, workingDirectory: string): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  const tokens = command.trim().split(/\s+/)
  const program = tokens[0]?.toLowerCase()
  if (isForbidden(command)) {
    return Promise.reject(new Error(`Forbidden command content: ${command}`))
  }
  if (!program || !config.shellCommandAllowlist.some(allowed => allowed === program)) {
    return Promise.reject(new Error(`Command not in allowlist: ${command}`))
  }
  return new Promise((resolvePromise, reject) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: workingDirectory })
      : spawn(program, tokens.slice(1), { cwd: workingDirectory })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => resolvePromise({ exit_code: code ?? 1, stdout, stderr }))
  })
}

async function shellHandler(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const command = params.command
  if (typeof command !== 'string' || command.trim().length === 0) return { success: false, output: null, error: 'Missing command' }
  const workingDirectory = typeof params.working_directory === 'string'
    ? resolve(context.workspacePath, params.working_directory)
    : resolve(context.workspacePath)
  try {
    const result = await executeCommand(command, workingDirectory)
    return { success: result.exit_code === 0, output: result, error: result.exit_code === 0 ? undefined : result.stderr }
  } catch (error) {
    return { success: false, output: null, error: error instanceof Error ? error.message : 'Command failed' }
  }
}

export function registerShellTools(registry: ToolRegistry): void {
  registry.register({
    name: 'run_shell_command',
    description: 'Run an allowlisted shell command in the workspace.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 60000,
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Allowlisted command to execute.' },
        working_directory: { type: 'string', description: 'Optional workspace-relative working directory.' },
      },
      required: ['command'],
    },
    handler: shellHandler,
  })
}