import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDatabase } from '../../src/db/client.js'
import * as schema from '../../src/db/schema.js'
import * as sessionManager from '../../src/core/sessions/session.manager.js'
import { Orchestrator } from '../../src/core/orchestrator/orchestrator.js'
import type { AgentProvider, AgentRequest, AgentResponse, HealthStatus } from '../../src/agents/interfaces/agent.provider.js'
import { findMessagesBySessionId } from '../../src/db/repositories/message.repo.js'
import { findEvidenceBySessionId } from '../../src/db/repositories/evidence.repo.js'

const result = (sender: 'agent_a' | 'agent_b', action: 'CONCLUDE' | 'CONTINUE' = 'CONCLUDE'): AgentResponse => ({
  result: {
    message_type: 'investigation_result', protocol_version: '1.0', session_id: 'pending', task_id: 'pending', sender, recipient: 'orchestrator', status: 'completed',
    observations: sender === 'agent_a' ? [{ id: 'obs', statement: 'Possible cause' }] : [],
    evidence: sender === 'agent_b' ? [{ id: 'ev', type: 'observation', description: 'Observed cause', confidence: 0.9 }] : [],
    experiments: [], conclusions: [], remaining_unknowns: [], recommended_next_action: action, agent_assessment: 'neutral',
  }, rawResponse: '{}', model: sender, durationMs: 1,
})

class FakeProvider implements AgentProvider {
  readonly name: string
  calls = 0
  constructor(name: string, private readonly responses: AgentResponse[]) { this.name = name }
  async send(_request: AgentRequest): Promise<AgentResponse> { const response = this.responses[this.calls]; this.calls += 1; if (!response) throw new Error('Unexpected fake provider call'); return response }
  async healthCheck(): Promise<HealthStatus> { return { ok: true, message: 'fake' } }
}

describe('two-agent orchestrator', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    const testDb = drizzle(sqlite, { schema })
    setDatabase(testDb)
    migrate(testDb, { migrationsFolder: './src/db/migrations' })
  })

  afterEach(() => sqlite.close())

  it('runs the planning, investigation, and review lifecycle', async () => {
    const session = await sessionManager.createSession({ objective: 'Find the cause', agentAProvider: 'manual', agentBModel: 'test', maxIterations: 2 })
    const agentA = new FakeProvider('manual', [result('agent_a'), result('agent_a')])
    const agentB = new FakeProvider('ollama', [result('agent_b')])
    await new Orchestrator(agentA, agentB).run(session.id, session.objective)
    await expect(sessionManager.getSession(session.id)).resolves.toMatchObject({ status: 'CONCLUDED' })
    expect(agentA.calls).toBe(2)
    expect(agentB.calls).toBe(1)
    await expect(findEvidenceBySessionId(session.id)).resolves.toHaveLength(1)
    await expect(findMessagesBySessionId(session.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ sender: 'agent_a' }), expect.objectContaining({ sender: 'agent_b' })]))
  })
})