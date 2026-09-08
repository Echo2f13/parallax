import { describe, expect, it } from 'vitest'
import { registerShellTools } from '../../src/tools/shell/shell.tools.js'
import { ToolRegistry } from '../../src/tools/registry/tool.registry.js'

describe('shell tools', () => {
  it('runs an allowlisted echo command', async () => {
    const registry = new ToolRegistry()
    registerShellTools(registry)
    const result = await registry.getTool('run_shell_command').handler({ command: 'echo hello' }, { sessionId: 'test', workspacePath: process.cwd() })
    expect(result.success).toBe(true)
    expect(result.output).toMatchObject({ exit_code: 0 })
    expect((result.output as { stdout: string }).stdout).toContain('hello')
  })

  it('rejects a disallowed command', async () => {
    const registry = new ToolRegistry()
    registerShellTools(registry)
    const result = await registry.getTool('run_shell_command').handler({ command: 'curl example.com' }, { sessionId: 'test', workspacePath: process.cwd() })
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Command not in allowlist') })
  })

  it('rejects rm as a standalone token', async () => {
    const registry = new ToolRegistry()
    registerShellTools(registry)
    const result = await registry.getTool('run_shell_command').handler({ command: 'rm -rf test' }, { sessionId: 'test', workspacePath: process.cwd() })
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Forbidden command content') })
  })

  it('allows npm install with package names containing rm or del', async () => {
    const registry = new ToolRegistry()
    registerShellTools(registry)
    const result = await registry.getTool('run_shell_command').handler(
      { command: 'echo drizzle-orm' },
      { sessionId: 'test', workspacePath: process.cwd() },
    )
    expect(result.success).toBe(true)
  })
})