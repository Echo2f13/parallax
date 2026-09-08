import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as hypothesisRepo from '../../src/db/repositories/hypothesis.repo.js'
import { db, setDatabase } from '../../src/db/client.js'
import { insertSession } from '../../src/db/repositories/session.repo.js'
import * as schema from '../../src/db/schema.js'

describe('hypothesis repository', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    setDatabase(drizzle(sqlite, { schema }))
    migrate(db, { migrationsFolder: './src/db/migrations' })
    await insertSession({ id: 'hypothesis-session', objective: 'Hypothesis', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
  })

  afterEach(() => sqlite.close())

  it('creates and updates a hypothesis status', async () => {
    const hypothesis = await hypothesisRepo.insertHypothesis({ sessionId: 'hypothesis-session', statement: 'The test is flaky', proposedBy: 'agent_b' })
    expect(hypothesis.id).toMatch(/^H-/)
    await hypothesisRepo.updateHypothesisStatus(hypothesis.id, 'confirmed', ['EVD-123'])
    await expect(hypothesisRepo.findHypothesesBySessionId('hypothesis-session')).resolves.toMatchObject([{ status: 'confirmed', evidenceIds: '["EVD-123"]' }])
  })
})