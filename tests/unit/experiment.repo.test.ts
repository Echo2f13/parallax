import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as experimentRepo from '../../src/db/repositories/experiment.repo.js'
import { db, setDatabase } from '../../src/db/client.js'
import { insertSession } from '../../src/db/repositories/session.repo.js'
import * as schema from '../../src/db/schema.js'

describe('experiment repository', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    setDatabase(drizzle(sqlite, { schema }))
    migrate(db, { migrationsFolder: './src/db/migrations' })
    await insertSession({ id: 'experiment-session', objective: 'Experiment', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
  })

  afterEach(() => sqlite.close())

  it('creates a pending experiment and completes it', async () => {
    const experiment = await experimentRepo.insertExperiment({ sessionId: 'experiment-session', objective: 'Test action', requestedBy: 'agent_a', executedBy: 'agent_b', actions: ['echo test'] })
    expect(experiment.id).toMatch(/^EXP-/)
    expect(experiment.status).toBe('pending')
    await experimentRepo.completeExperiment(experiment.id, { actualResult: 'passed', status: 'completed', conclusion: 'Works' })
    await expect(experimentRepo.findExperimentsBySessionId('experiment-session')).resolves.toMatchObject([{ id: experiment.id, status: 'completed', actualResult: 'passed' }])
  })
})