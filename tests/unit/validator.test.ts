import { describe, expect, it } from 'vitest'
import { validateAgentResponse } from '../../src/protocol/validator.js'

const validResult = {
  message_type: 'investigation_result',
  protocol_version: '1.0',
  session_id: 'session-1',
  task_id: 'task-1',
  sender: 'agent_b',
  recipient: 'orchestrator',
  status: 'completed',
  observations: [{ id: 'obs-1', statement: 'Observed behavior' }],
  evidence: [{ id: 'ev-1', type: 'source_code', location: 'src/main.ts', description: 'Entry point', confidence: 0.9 }],
  experiments: [],
  conclusions: [{ statement: 'The entry point is main.ts', confidence: 0.9 }],
  remaining_unknowns: [],
  recommended_next_action: 'CONCLUDE',
  agent_assessment: 'neutral',
}

describe('validateAgentResponse', () => {
  it('accepts a valid investigation result', () => {
    expect(validateAgentResponse(validResult).valid).toBe(true)
  })

  it('rejects a result without status', () => {
    const { status: _status, ...missingStatus } = validResult
    expect(validateAgentResponse(missingStatus).valid).toBe(false)
  })

  it('rejects an invalid status', () => {
    expect(validateAgentResponse({ ...validResult, status: 'done' }).valid).toBe(false)
  })

  it('rejects a result without session_id', () => {
    const { session_id: _sessionId, ...missingSessionId } = validResult
    expect(validateAgentResponse(missingSessionId).valid).toBe(false)
  })

  it('rejects an invalid recommended action', () => {
    expect(validateAgentResponse({ ...validResult, recommended_next_action: 'WAIT' }).valid).toBe(false)
  })
})