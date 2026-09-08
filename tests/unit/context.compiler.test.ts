import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, setDatabase } from '../../src/db/client.js'
import * as schema from '../../src/db/schema.js'
import * as sessionManager from '../../src/core/sessions/session.manager.js'
import { insertEvidence } from '../../src/db/repositories/evidence.repo.js'
import { insertHypothesis } from '../../src/db/repositories/hypothesis.repo.js'
import { ContextCompiler } from '../../src/core/state/context.compiler.js'

describe('ContextCompiler', () => {
  let sqlite: Database.Database
  let sessionId: string

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    const testDb = drizzle(sqlite, { schema })
    setDatabase(testDb)
    migrate(db, { migrationsFolder: './src/db/migrations' })
    const session = await sessionManager.createSession({ objective: 'Compact context', agentAProvider: 'manual', agentBModel: 'test' })
    sessionId = session.id
    await insertHypothesis({ sessionId, statement: 'Active', proposedBy: 'agent_b' })
    const rejected = await insertHypothesis({ sessionId, statement: 'Rejected', proposedBy: 'agent_a' })
    const { updateHypothesisStatus } = await import('../../src/db/repositories/hypothesis.repo.js')
    await updateHypothesisStatus(rejected.id, 'rejected')
    for (let index = 0; index < 30; index += 1) await insertEvidence({ sessionId, type: 'observation', source: 'agent_b', description: `Evidence ${index}`, confidence: index === 0 ? 0.95 : 0.5 })
  })

  afterEach(() => sqlite.close())

  it('contains the required compact context fields without messages', async () => {
    const context = await new ContextCompiler().buildForAgentA(sessionId, 1)
    expect(context).toEqual(expect.objectContaining({ objective: 'Compact context', current_state: 'PLANNING', hypotheses: expect.any(Array), recent_experiments: expect.any(Array), unresolved_questions: expect.any(Array), output_schema: expect.any(Object) }))
    expect('messages' in context).toBe(false)
  })

  it('includes only active hypotheses and at most 15 latest evidence items', async () => {
    const context = await new ContextCompiler().buildForAgentB(sessionId, 4)
    expect(context.hypotheses).toHaveLength(1)
    expect(context.hypotheses[0]?.statement).toBe('Active')
    expect(context.latest_evidence).toHaveLength(15)
    expect(context.confirmed_facts).toEqual(['Evidence 0'])
  })
})