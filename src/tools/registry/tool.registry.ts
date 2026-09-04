export type PermissionLevel = 'READ_ONLY' | 'SAFE_EXECUTION' | 'RESTRICTED_EXECUTION'

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, { type: string; description: string }>
  required: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  permission_level: PermissionLevel
  input_schema: ToolInputSchema
  timeout_ms: number
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

export interface ToolContext {
  sessionId: string
  taskId?: string
  workspacePath: string
}

export interface ToolResult {
  success: boolean
  output: unknown
  error?: string
  truncated?: boolean
}

export interface OllamaToolFormat {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolInputSchema
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): ToolDefinition {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool not found: ${name}`)
    return tool
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  getToolsForOllama(): OllamaToolFormat[] {
    return this.listTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }))
  }
}

export const toolRegistry = new ToolRegistry()