import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../client.js'
import { contradictions } from '../schema.js'
import type { Contradiction } from '../schema.js'

export interface NewContradiction {
  sessionId: string
  evidenceIdA: string
  evidenceIdB: string
  description: string
}

export async function insertContradiction(data: NewContradiction): Promise<Contradiction> {
  const [record] = await db.insert(contradictions).values({
    id: `CONT-${nanoid(6)}`,
    sessionId: data.sessionId,
    evidenceIdA: data.evidenceIdA,
    evidenceIdB: data.evidenceIdB,
    description: data.description,
    status: 'unresolved',
    createdAt: new Date().toISOString(),
  }).returning()
  if (!record) throw new Error('Failed to insert contradiction')
  return record
}

export async function findContradictionsBySessionId(sessionId: string): Promise<Contradiction[]> {
  return db.select().from(contradictions).where(eq(contradictions.sessionId, sessionId)).orderBy(asc(contradictions.createdAt))
}

export async function resolveContradiction(id: string, experimentId: string): Promise<void> {
  const updated = await db.update(contradictions).set({ status: 'resolved', resolvedByExperimentId: experimentId }).where(eq(contradictions.id, id)).returning({ id: contradictions.id })
  if (updated.length === 0) throw new Error('Contradiction not found')
}