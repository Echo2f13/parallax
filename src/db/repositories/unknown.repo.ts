import { asc, eq } from 'drizzle-orm'
import { db } from '../client.js'
import { unknowns } from '../schema.js'
import type { Unknown } from '../schema.js'

export async function findUnknownsBySessionId(sessionId: string): Promise<Unknown[]> {
  return db.select().from(unknowns).where(eq(unknowns.sessionId, sessionId)).orderBy(asc(unknowns.createdAt))
}