import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../src/db/schema.js'
import { db, setDatabase } from '../../src/db/client.js'
import { insertSession } from '../../src/db/repositories/session.repo.js'
import { ToolExecutor } from '../../src/tools/registry/tool.executor.js'
import { ToolRegistry, toolRegistry } from '../../src/tools/registry/tool.registry.js'

describe('ToolExecutor', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    const testDb = drizzle(sqlite, { schema })
    migrate(testDb, { migrationsFolder: './src/db/migrations' })
    setDatabase(testDb)
    await insertSession({ id: 'audit-session', objective: 'Audit', status: 'CREATED', agentAProvider: 'manual', agentBModel: 'test', maxAgentMessages: 100, maxIterations: 8, maxRuntimeSeconds: 1800, createdAt: new Date().toISOString() })
  })

  afterEach(() => sqlite.close())

  it('audits a successful tool call', async () => {
    const registry = new ToolRegistry()
    registry.register({ name: 'audit_test', description: 'test', permission_level: 'READ_ONLY', timeout_ms: 1000, input_schema: { type: 'object', properties: {}, required: [] }, handler: async () => ({ success: true, output: 'ok' }) })
    const original = toolRegistry.listTools()
    for (const tool of original) toolRegistry.register(tool)
    const executor = new ToolExecutor()
    toolRegistry.register(registry.getTool('audit_test'))
    const result = await executor.execute('audit_test', {}, { sessionId: 'audit-session', workspacePath: process.cwd() }, 'audit-session')
    expect(result).toEqual({ success: true, output: 'ok' })
    const records = await db.select().from(schema.toolCalls)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ toolName: 'audit_test', exitCode: 0, output: '"ok"' })
  })

  it('audits a timed-out tool call', async () => {
    toolRegistry.register({
      name: 'timeout_test',
      description: 'test timeout',
      permission_level: 'READ_ONLY',
      timeout_ms: 1,
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async () => new Promise(resolve => setTimeout(() => resolve({ success: true, output: 'late' }), 20)),
    })
    await expect(new ToolExecutor().execute('timeout_test', {}, { sessionId: 'audit-session', workspacePath: process.cwd() }, 'audit-session')).rejects.toThrow('Tool timed out')
    const records = await db.select().from(schema.toolCalls)
    expect(records[0]).toMatchObject({ toolName: 'timeout_test', exitCode: 1 })
  })
})