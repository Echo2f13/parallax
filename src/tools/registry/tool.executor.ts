import { isAbsolute, relative, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import * as toolcallRepo from '../../db/repositories/toolcall.repo.js'
import { toolRegistry } from './tool.registry.js'
import type { ToolContext, ToolResult } from './tool.registry.js'

const MAX_OUTPUT_LENGTH = 50000

export class ToolExecutor {
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
    auditSessionId: string,
    auditTaskId?: string,
  ): Promise<ToolResult> {
    const tool = toolRegistry.getTool(toolName)
    this.validatePaths(params, context.workspacePath)
    const toolCallId = nanoid()
    const startedAt = new Date().toISOString()
    await toolcallRepo.insertToolCall({
      id: toolCallId,
      sessionId: auditSessionId,
      taskId: auditTaskId,
      toolName,
      inputParams: JSON.stringify(params),
      permissionLevel: tool.permission_level,
      startedAt,
    })

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Tool timed out after ${tool.timeout_ms}ms: ${toolName}`)), tool.timeout_ms)
      })
      const result = await Promise.race([tool.handler(params, context), timeout])
      const normalized = this.truncateResult(result)
      await toolcallRepo.updateToolCall(toolCallId, {
        output: JSON.stringify(normalized.output),
        finishedAt: new Date().toISOString(),
        exitCode: normalized.success ? 0 : 1,
        error: normalized.error,
      })
      return normalized
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool execution error'
      await toolcallRepo.updateToolCall(toolCallId, {
        finishedAt: new Date().toISOString(),
        exitCode: 1,
        error: message,
      })
      throw error
    }
  }

  private validatePaths(params: Record<string, unknown>, workspacePath: string): void {
    for (const key of ['path', 'target', 'working_directory']) {
      const value = params[key]
      if (typeof value !== 'string' || !isAbsolute(value)) continue
      const workspace = resolve(workspacePath)
      const candidate = resolve(value)
      const outsideWorkspace = relative(workspace, candidate).startsWith('..')
      if (outsideWorkspace) throw new Error(`Path outside workspace: ${value}`)
    }
  }

  private truncateResult(result: ToolResult): ToolResult {
    if (typeof result.output !== 'string' || result.output.length <= MAX_OUTPUT_LENGTH) return result
    return {
      ...result,
      output: `${result.output.slice(0, MAX_OUTPUT_LENGTH)}\n[Parallax] Output truncated after ${MAX_OUTPUT_LENGTH} characters.`,
      truncated: true,
    }
  }
}