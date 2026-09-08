import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as evidenceRepo from '../../src/db/repositories/evidence.repo.js'
import { db, setDatabase } from '../../src/db/client.js'
import { insertSession } from '../../src/db/repositories/session.repo.js'
import * as schema from '../../src/db/schema.js'

describe('evidence repository', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    setDatabase(drizzle(sqlite, { schema }))
    migrate(db, { migrationsFolder: './src/db/migrations' })
    await insertSession({ id: 'evidence-session', objective: 'Evidence', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
    await insertSession({ id: 'other-session', objective: 'Other', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
  })

  afterEach(() => sqlite.close())

  it('inserts evidence with an EVD ID', async () => {
    const record = await evidenceRepo.insertEvidence({ sessionId: 'evidence-session', type: 'source_code', source: 'agent_b', description: 'Found code', confidence: 0.8 })
    expect(record.id).toMatch(/^EVD-/)
  })

  it('does not export updateEvidence', () => {
    expect('updateEvidence' in evidenceRepo).toBe(false)
  })

  it('finds evidence by session and ID', async () => {
    const record = await evidenceRepo.insertEvidence({ sessionId: 'evidence-session', type: 'observation', source: 'tool', description: 'Observation' })
    await evidenceRepo.insertEvidence({ sessionId: 'other-session', type: 'observation', source: 'tool', description: 'Other' })
    await expect(evidenceRepo.findEvidenceBySessionId('evidence-session')).resolves.toEqual([record])
    await expect(evidenceRepo.findEvidenceById('missing')).resolves.toBeNull()
  })
})