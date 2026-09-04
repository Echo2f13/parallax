export interface Hypothesis {
  id: string
  statement: string
  confidence: number
}

export interface RequestedAction {
  action: string
  target?: string
  params?: Record<string, unknown>
}

export interface InvestigationContext {
  current_state: string
  iteration: number
  confirmed_facts: string[]
  unresolved_questions: string[]
  recent_experiments: ExperimentItem[]
}

export interface InvestigationConstraints {
  max_tool_calls: number
  workspace_path: string
}

export interface InvestigationRequest {
  message_type: 'investigation_request'
  protocol_version: '1.0'
  session_id: string
  task_id: string
  sender: 'orchestrator'
  recipient: 'agent_a' | 'agent_b'
  objective: string
  hypotheses: Hypothesis[]
  requested_actions: RequestedAction[]
  required_output: string[]
  context: InvestigationContext
  constraints: InvestigationConstraints
  output_schema: Record<string, unknown>
}

export interface ObservationItem {
  id: string
  statement: string
}

export interface EvidenceItem {
  id: string
  type: string
  location: string
  description: string
  confidence: number
}

export interface ExperimentItem {
  id: string
  action: string
  result: string
}

export interface ConclusionItem {
  statement: string
  confidence: number
}

export interface InvestigationResult {
  message_type: 'investigation_result'
  protocol_version: '1.0'
  session_id: string
  task_id: string
  sender: 'agent_a' | 'agent_b'
  recipient: 'orchestrator'
  status: 'completed' | 'partial' | 'blocked' | 'error'
  observations: ObservationItem[]
  evidence: EvidenceItem[]
  experiments: ExperimentItem[]
  conclusions: ConclusionItem[]
  remaining_unknowns: string[]
  recommended_next_action: 'CONTINUE' | 'EXPERIMENT_REQUIRED' | 'CONCLUDE' | 'BLOCKED' | 'REVISE_HYPOTHESIS'
  agent_assessment: 'agree' | 'disagree' | 'neutral'
  disagreement_reason?: string
  disagreement_evidence_ids?: string[]
}