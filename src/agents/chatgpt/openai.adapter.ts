import type { AgentProvider, AgentRequest, AgentResponse, HealthStatus } from '../interfaces/agent.provider.js'

export class OpenAIAdapter implements AgentProvider {
  readonly name = 'openai'

  async send(_request: AgentRequest): Promise<AgentResponse> {
    throw new Error('OpenAI adapter is not configured. Set OPENAI_API_KEY and enable this adapter.')
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: false, message: 'OpenAI adapter not configured' }
  }
}