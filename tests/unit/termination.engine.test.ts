import { describe, expect, it } from 'vitest'
import { TerminationEngine } from '../../src/core/termination/termination.engine.js'
import type { Session } from '../../src/db/schema.js'

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session', name: null, objective: 'test', status: 'INVESTIGATING', agentAProvider: 'manual', agentBModel: 'test', workspacePath: '.',
    maxIterations: 3, maxRuntimeSeconds: 60, maxAgentMessages: 10, createdAt: new Date().toISOString(), updatedAt: null, terminatedAt: null, terminationReason: null,
    ...overrides,
  }
}

describe('TerminationEngine', () => {
  const engine = new TerminationEngine()

  it('does not terminate below all limits', () => {
    expect(engine.check(session(), 1, 1, new Date())).toEqual({ shouldTerminate: false })
  })

  it('terminates at max iterations', () => {
    const result = engine.check(session({ maxIterations: 2 }), 2, 0, new Date())
    expect(result.shouldTerminate).toBe(true)
    expect(result.reason).toContain('max_iterations')
  })

  it('terminates after the runtime limit', () => {
    const startedAt = new Date(Date.now() - 61000)
    const result = engine.check(session({ maxRuntimeSeconds: 60 }), 0, 0, startedAt)
    expect(result.shouldTerminate).toBe(true)
    expect(result.reason).toContain('max_runtime_seconds')
  })

  it('terminates at the message limit', () => {
    const result = engine.check(session({ maxAgentMessages: 2 }), 0, 2, new Date())
    expect(result.shouldTerminate).toBe(true)
    expect(result.reason).toContain('max_agent_messages')
  })
})