/**
 * src/reasoning/interfaces/reasoning.provider.ts
 *
 * Generic ReasoningProvider interface.
 * Ollama never calls ChatGPT directly — it calls the ask_reasoning_agent tool,
 * which Parallax routes to whatever ReasoningProvider is configured.
 *
 * Implementations:
 *   ChatGPTReasoningProvider  — uses existing ChatGPTBrowserAdapter
 *   ManualReasoningProvider   — fallback: prints question, waits for human paste
 */

export interface ReasoningRequest {
  message_type: 'reasoning_request'
  protocol_version: '1.0'

  session_id: string
  task_id: string

  sender: 'agent_b'
  recipient: 'agent_a'

  context: {
    current_page: string
    company: string
    role: string
  }

  problem: {
    type: 'application_question' | 'strategy_decision' | 'ambiguous_field' | 'general'
    question: string
    options?: string[]
  }

  candidate_context: {
    /** Relevant excerpt from profile.json — NOT the full profile */
    profile_summary: string
  }

  required_response: {
    format: 'answer'
    must_include: ['answer', 'confidence', 'reasoning_summary']
  }
}

export interface ReasoningResponse {
  message_type: 'reasoning_response'
  protocol_version: '1.0'

  session_id: string
  task_id: string

  sender: 'agent_a'
  recipient: 'agent_b'

  decision: {
    type: 'answer' | 'skip' | 'escalate'
  }

  answer: {
    value: string
    confidence: number
  }

  reasoning_summary: string

  recommended_action: {
    type: 'fill_field' | 'skip_field' | 'stop'
  }
}

export interface ReasoningHealthStatus {
  ok: boolean
  message: string
  latency_ms?: number
}

export interface ReasoningProvider {
  readonly name: string
  ask(request: ReasoningRequest): Promise<ReasoningResponse>
  healthCheck(): Promise<ReasoningHealthStatus>
}
