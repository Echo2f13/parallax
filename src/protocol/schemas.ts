import { z } from 'zod'

export const hypothesisSchema = z.object({
  id: z.string(),
  statement: z.string(),
  confidence: z.number(),
})

export const requestedActionSchema = z.object({
  action: z.string(),
  target: z.string().optional(),
  params: z.record(z.unknown()).optional(),
})

export const experimentItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  result: z.string(),
})

export const investigationContextSchema = z.object({
  current_state: z.string(),
  iteration: z.number(),
  confirmed_facts: z.array(z.string()),
  unresolved_questions: z.array(z.string()),
  recent_experiments: z.array(experimentItemSchema),
})

export const investigationConstraintsSchema = z.object({
  max_tool_calls: z.number(),
  workspace_path: z.string(),
})

export const investigationRequestSchema = z.object({
  message_type: z.literal('investigation_request'),
  protocol_version: z.literal('1.0'),
  session_id: z.string(),
  task_id: z.string(),
  sender: z.literal('orchestrator'),
  recipient: z.enum(['agent_a', 'agent_b']),
  objective: z.string(),
  hypotheses: z.array(hypothesisSchema),
  requested_actions: z.array(requestedActionSchema),
  required_output: z.array(z.string()),
  context: investigationContextSchema,
  constraints: investigationConstraintsSchema,
  output_schema: z.record(z.unknown()),
})

export const observationItemSchema = z.object({
  id: z.string(),
  statement: z.string(),
})

export const evidenceItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  location: z.string(),
  description: z.string(),
  confidence: z.number(),
})

export const conclusionItemSchema = z.object({
  statement: z.string(),
  confidence: z.number(),
})

export const investigationResultSchema = z.object({
  message_type: z.literal('investigation_result'),
  protocol_version: z.literal('1.0'),
  session_id: z.string(),
  task_id: z.string(),
  sender: z.enum(['agent_a', 'agent_b']),
  recipient: z.literal('orchestrator'),
  status: z.enum(['completed', 'partial', 'blocked', 'error']),
  observations: z.array(observationItemSchema),
  evidence: z.array(evidenceItemSchema),
  experiments: z.array(experimentItemSchema),
  conclusions: z.array(conclusionItemSchema),
  remaining_unknowns: z.array(z.string()),
  recommended_next_action: z.enum(['CONTINUE', 'EXPERIMENT_REQUIRED', 'CONCLUDE', 'BLOCKED', 'REVISE_HYPOTHESIS']),
  agent_assessment: z.enum(['agree', 'disagree', 'neutral']),
  disagreement_reason: z.string().optional(),
  disagreement_evidence_ids: z.array(z.string()).optional(),
})