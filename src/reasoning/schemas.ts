/**
 * src/reasoning/schemas.ts
 *
 * Zod schemas for the agent-to-agent reasoning protocol.
 * All reasoning requests and responses are validated against these before use.
 */

import { z } from 'zod'

export const reasoningRequestSchema = z.object({
  message_type:      z.literal('reasoning_request'),
  protocol_version:  z.literal('1.0'),
  session_id:        z.string().min(1),
  task_id:           z.string().min(1),
  sender:            z.literal('agent_b'),
  recipient:         z.literal('agent_a'),
  context: z.object({
    current_page: z.string(),
    company:      z.string(),
    role:         z.string(),
  }),
  problem: z.object({
    type:     z.enum(['application_question', 'strategy_decision', 'ambiguous_field', 'general']),
    question: z.string().min(1),
    options:  z.array(z.string()).optional(),
  }),
  candidate_context: z.object({
    profile_summary: z.string(),
  }),
  required_response: z.object({
    format:       z.literal('answer'),
    must_include: z.tuple([
      z.literal('answer'),
      z.literal('confidence'),
      z.literal('reasoning_summary'),
    ]),
  }),
})

export const reasoningResponseSchema = z.object({
  message_type:     z.literal('reasoning_response'),
  protocol_version: z.literal('1.0'),
  session_id:       z.string().min(1),
  task_id:          z.string().min(1),
  sender:           z.literal('agent_a'),
  recipient:        z.literal('agent_b'),
  decision: z.object({
    type: z.enum(['answer', 'skip', 'escalate']),
  }),
  answer: z.object({
    value:      z.string(),
    confidence: z.number().min(0).max(1),
  }),
  reasoning_summary: z.string(),
  recommended_action: z.object({
    type: z.enum(['fill_field', 'skip_field', 'stop']),
  }),
})

export type ReasoningRequestSchema  = z.infer<typeof reasoningRequestSchema>
export type ReasoningResponseSchema = z.infer<typeof reasoningResponseSchema>

/**
 * Validate a raw reasoning response.
 * Returns { valid: true, data } or { valid: false, errors }.
 */
export function validateReasoningResponse(raw: unknown): {
  valid: true;  data: ReasoningResponseSchema
} | {
  valid: false; errors: string[]
} {
  const result = reasoningResponseSchema.safeParse(raw)
  if (result.success) {
    return { valid: true, data: result.data }
  }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  }
}
