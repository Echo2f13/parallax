import { Ollama } from 'ollama'
import { config } from '../../config/config.js'
import type { AgentProvider, AgentRequest, AgentResponse, HealthStatus } from '../interfaces/agent.provider.js'
import { validateAgentResponse } from '../../protocol/validator.js'
import { ToolExecutor } from '../../tools/registry/tool.executor.js'
import { toolRegistry } from '../../tools/registry/tool.registry.js'

const retryPrompt = 'Your previous response was not valid JSON. Respond ONLY with a JSON object. No explanation. No markdown. No code blocks. Raw JSON only.'

export class OllamaAdapter implements AgentProvider {
  readonly name = 'ollama'
  private readonly model: string
  private readonly client: Ollama
  private readonly toolExecutor: ToolExecutor

  constructor(model: string = config.ollamaDefaultModel) {
    this.model = model
    this.client = new Ollama({ host: config.ollamaBaseUrl })
    this.toolExecutor = new ToolExecutor()
  }

  async send(request: AgentRequest): Promise<AgentResponse> {
    const startedAt = Date.now()
    const systemPrompt = 'Respond ONLY with valid JSON matching the InvestigationResult protocol. Do not use markdown or explanatory text.'
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(request.request) },
    ]
    let response = await this.client.chat({
      model: request.model ?? this.model,
      messages,
      tools: toolRegistry.getToolsForOllama(),
    })
    let rawResponse = response.message.content
    let toolCallCount = 0
    while (response.message.tool_calls && response.message.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: response.message.content })
      for (const toolCall of response.message.tool_calls) {
        toolCallCount += 1
        if (toolCallCount > 10) throw new Error('OllamaAdapter: maximum tool calls exceeded')
        const result = await this.toolExecutor.execute(
          toolCall.function.name,
          toolCall.function.arguments as Record<string, unknown>,
          { sessionId: request.sessionId, workspacePath: request.request.constraints.workspace_path },
          request.sessionId,
          request.request.task_id,
        )
        messages.push({ role: 'tool', content: JSON.stringify(result) })
      }
      response = await this.client.chat({ model: request.model ?? this.model, messages, tools: toolRegistry.getToolsForOllama() })
      rawResponse = response.message.content
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(rawResponse) as unknown
    } catch {
      const retryResponse = await this.client.chat({
        model: request.model ?? this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(request.request) },
          { role: 'assistant', content: rawResponse },
          { role: 'user', content: retryPrompt },
        ],
      })
      rawResponse = retryResponse.message.content
      try {
        parsed = JSON.parse(rawResponse) as unknown
      } catch {
        throw new Error('OllamaAdapter: failed to parse valid JSON after retry')
      }
    }
    const validation = validateAgentResponse(parsed)
    if (!validation.valid) {
      throw new Error(`OllamaAdapter: response failed schema validation: ${validation.errors.join(', ')}`)
    }
    return {
      result: validation.data,
      rawResponse,
      model: request.model ?? this.model,
      durationMs: Date.now() - startedAt,
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const startedAt = Date.now()
    try {
      const response = await fetch(`${config.ollamaBaseUrl}/api/tags`)
      if (!response.ok) return { ok: false, message: `Ollama health check failed with status ${response.status}` }
      const payload: unknown = await response.json()
      const models = typeof payload === 'object' && payload !== null && 'models' in payload && Array.isArray(payload.models)
        ? payload.models
        : []
      const found = models.some(model => typeof model === 'object' && model !== null && 'name' in model && model.name === this.model)
      return {
        ok: found,
        message: found ? 'Configured Ollama model is available' : `Configured Ollama model not found: ${this.model}`,
        latency_ms: Date.now() - startedAt,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Ollama health check error'
      return { ok: false, message, latency_ms: Date.now() - startedAt }
    }
  }
}