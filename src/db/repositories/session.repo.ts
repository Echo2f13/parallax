import { eq, asc } from 'drizzle-orm'
import { db } from '../client.js'
import { messages, sessions, tasks, toolCalls } from '../schema.js'
import type { NewSession, Session } from '../schema.js'

export async function insertSession(data: NewSession): Promise<Session> {
  const [session] = await db.insert(sessions).values(data).returning()
  if (!session) throw new Error('Failed to insert session')
  return session
}

export async function findSessionById(id: string): Promise<Session | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
  return session ?? null
}

export async function findAllSessions(): Promise<Session[]> {
  return db.select().from(sessions).orderBy(asc(sessions.createdAt))
}

export async function updateSessionStatus(id: string, status: string, reason?: string): Promise<void> {
  const now = new Date().toISOString()
  const updated = await db.update(sessions)
    .set({
      status,
      updatedAt: now,
      terminationReason: reason,
      terminatedAt: ['CONCLUDED', 'STOPPED', 'BLOCKED', 'ERROR'].includes(status) ? now : undefined,
    })
    .where(eq(sessions.id, id))
    .returning({ id: sessions.id })
  if (updated.length === 0) throw new Error('Session not found')
}

export async function deleteSessionById(id: string): Promise<void> {
  const existing = await findSessionById(id)
  if (!existing) throw new Error('Session not found')
  await db.delete(messages).where(eq(messages.sessionId, id))
  await db.delete(toolCalls).where(eq(toolCalls.sessionId, id))
  await db.delete(tasks).where(eq(tasks.sessionId, id))
  const deleted = await db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id })
  if (deleted.length === 0) throw new Error('Session not found')
}