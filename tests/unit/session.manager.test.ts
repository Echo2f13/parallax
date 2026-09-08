import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../src/db/schema.js'
import { setDatabase } from '../../src/db/client.js'
import * as sessionManager from '../../src/core/sessions/session.manager.js'
import { insertEvidence } from '../../src/db/repositories/evidence.repo.js'

describe('session manager', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    const testDb = drizzle(sqlite, { schema })
    migrate(testDb, { migrationsFolder: './src/db/migrations' })
    setDatabase(testDb)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('creates a session with an ID and CREATED status', async () => {
    const session = await sessionManager.createSession({ objective: 'Test', agentAProvider: 'manual', agentBModel: 'test-model' })
    expect(session.id).toBeTruthy()
    expect(session.status).toBe('CREATED')
  })

  it('returns a session by ID and throws for an unknown ID', async () => {
    const session = await sessionManager.createSession({ objective: 'Test', agentAProvider: 'manual', agentBModel: 'test-model' })
    await expect(sessionManager.getSession(session.id)).resolves.toEqual(session)
    await expect(sessionManager.getSession('unknown')).rejects.toThrow('Session not found')
  })

  it('updates status and deletes a session', async () => {
    const session = await sessionManager.createSession({ objective: 'Test', agentAProvider: 'manual', agentBModel: 'test-model' })
    await sessionManager.updateStatus(session.id, 'CONCLUDED')
    await expect(sessionManager.getSession(session.id)).resolves.toMatchObject({ status: 'CONCLUDED' })
    await sessionManager.deleteSession(session.id)
    await expect(sessionManager.getSession(session.id)).rejects.toThrow('Session not found')
  })

  it('deletes a session that has evidence and hypotheses without FK errors', async () => {
    const session = await sessionManager.createSession({ objective: 'Cascade test', agentAProvider: 'manual', agentBModel: 'test' })
    await insertEvidence({ sessionId: session.id, type: 'observation', source: 'agent_b', description: 'Test evidence' })
    await expect(sessionManager.deleteSession(session.id)).resolves.not.toThrow()
    await expect(sessionManager.getSession(session.id)).rejects.toThrow('Session not found')
  })
})