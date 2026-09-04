import type { InvestigationRequest, InvestigationResult } from '../../protocol/messages.js'

export interface AgentRequest {
  request: InvestigationRequest
  model?: string
  sessionId: string
}

export interface AgentResponse {
  result: InvestigationResult
  rawResponse: string
  model: string
  durationMs: number
}

export interface HealthStatus {
  ok: boolean
  message: string
  latency_ms?: number
}

export interface AgentProvider {
  readonly name: string
  send(request: AgentRequest): Promise<AgentResponse>
  healthCheck(): Promise<HealthStatus>
}