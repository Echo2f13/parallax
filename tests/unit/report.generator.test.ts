import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, setDatabase } from '../../src/db/client.js'
import * as schema from '../../src/db/schema.js'
import * as sessionManager from '../../src/core/sessions/session.manager.js'
import { insertEvidence } from '../../src/db/repositories/evidence.repo.js'
import { insertMessage } from '../../src/db/repositories/message.repo.js'
import { ReportGenerator } from '../../src/core/reports/report.generator.js'

describe('ReportGenerator', () => {
  let sqlite: Database.Database
  let sessionId: string

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    const testDb = drizzle(sqlite, { schema })
    setDatabase(testDb)
    migrate(db, { migrationsFolder: './src/db/migrations' })
    const session = await sessionManager.createSession({ objective: 'Report objective', agentAProvider: 'manual', agentBModel: 'test' })
    sessionId = session.id
    await sessionManager.updateStatus(sessionId, 'CONCLUDED', 'Done')
    await insertEvidence({ sessionId, type: 'observation', source: 'agent_b', description: 'Confirmed fact', confidence: 0.95 })
    await insertMessage({ id: 'report-message', sessionId, sender: 'agent_a', messageType: 'investigation_result', payload: JSON.stringify({ conclusions: [{ statement: 'Final conclusion', confidence: 0.9 }] }), createdAt: new Date().toISOString() })
  })

  afterEach(() => sqlite.close())

  it('generates a structured report', async () => {
    const report = await new ReportGenerator().generate(sessionId)
    expect(report).toEqual(expect.objectContaining({ summary: 'Final conclusion', confirmed_facts: ['Confirmed fact'], meta: expect.objectContaining({ objective: 'Report objective', status: 'CONCLUDED' }) }))
  })

  it('renders all Markdown sections and valid JSON', async () => {
    const generator = new ReportGenerator()
    const report = await generator.generate(sessionId)
    const markdown = generator.toMarkdown(report)
    for (const header of ['## Summary', '## Confirmed Facts', '## Hypotheses', '## Experiments', '## Evidence', '## Contradictions', '## Conclusions', '## Remaining Unknowns', '## Recommended Next Steps']) expect(markdown).toContain(header)
    expect(markdown).toContain('Report objective')
    expect(JSON.parse(generator.toJSON(report)) as unknown).toEqual(report)
  })
})