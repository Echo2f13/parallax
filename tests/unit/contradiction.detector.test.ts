import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, setDatabase } from '../../src/db/client.js'
import * as schema from '../../src/db/schema.js'
import { insertSession } from '../../src/db/repositories/session.repo.js'
import { insertEvidence } from '../../src/db/repositories/evidence.repo.js'
import { ContradictionDetector } from '../../src/core/state/contradiction.detector.js'

describe('contradiction detector', () => {
  let sqlite: Database.Database
  let detector: ContradictionDetector

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    setDatabase(drizzle(sqlite, { schema }))
    migrate(db, { migrationsFolder: './src/db/migrations' })
    await insertSession({ id: 'contradiction-session', objective: 'Contradiction', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
    detector = new ContradictionDetector()
  })

  afterEach(() => sqlite.close())

  it('creates one contradiction for conflicting same-location evidence', async () => {
    await insertEvidence({ sessionId: 'contradiction-session', type: 'source_code', source: 'agent_a', location: 'src/app.ts', description: 'Uses cache' })
    const newer = await insertEvidence({ sessionId: 'contradiction-session', type: 'source_code', source: 'agent_b', location: 'src/app.ts', description: 'Does not use cache' })
    await expect(detector.checkForContradictions('contradiction-session', newer)).resolves.toHaveLength(1)
  })

  it('does not contradict different locations or identical descriptions', async () => {
    const first = await insertEvidence({ sessionId: 'contradiction-session', type: 'source_code', source: 'agent_a', location: 'a.ts', description: 'Same' })
    const different = await insertEvidence({ sessionId: 'contradiction-session', type: 'source_code', source: 'agent_b', location: 'b.ts', description: 'Different' })
    const identical = await insertEvidence({ sessionId: 'contradiction-session', type: 'source_code', source: 'agent_b', location: 'a.ts', description: 'Same' })
    await expect(detector.checkForContradictions('contradiction-session', different)).resolves.toEqual([])
    await expect(detector.checkForContradictions('contradiction-session', identical)).resolves.toEqual([])
    expect(first.id).not.toBe(identical.id)
  })
})