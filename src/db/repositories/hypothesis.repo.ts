import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../client.js'
import { hypotheses } from '../schema.js'
import type { Hypothesis } from '../schema.js'

export type HypothesisStatus = 'active' | 'confirmed' | 'rejected' | 'superseded'

export interface NewHypothesis {
  sessionId: string
  statement: string
  confidence?: number
  proposedBy: 'agent_a' | 'agent_b'
  evidenceIds?: string[]
}

export async function insertHypothesis(data: NewHypothesis): Promise<Hypothesis> {
  const [record] = await db.insert(hypotheses).values({
    id: `H-${nanoid(6)}`,
    sessionId: data.sessionId,
    statement: data.statement,
    confidence: data.confidence ?? 0.5,
    status: 'active',
    proposedBy: data.proposedBy,
    evidenceIds: data.evidenceIds ? JSON.stringify(data.evidenceIds) : undefined,
    createdAt: new Date().toISOString(),
  }).returning()
  if (!record) throw new Error('Failed to insert hypothesis')
  return record
}

export async function findHypothesesBySessionId(sessionId: string): Promise<Hypothesis[]> {
  return db.select().from(hypotheses).where(eq(hypotheses.sessionId, sessionId)).orderBy(asc(hypotheses.createdAt))
}

export async function updateHypothesisStatus(id: string, status: HypothesisStatus, evidenceIds?: string[]): Promise<void> {
  const updated = await db.update(hypotheses).set({
    status,
    evidenceIds: evidenceIds ? JSON.stringify(evidenceIds) : undefined,
    updatedAt: new Date().toISOString(),
  }).where(eq(hypotheses.id, id)).returning({ id: hypotheses.id })
  if (updated.length === 0) throw new Error('Hypothesis not found')
}