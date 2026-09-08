import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../client.js'
import { evidence } from '../schema.js'
import type { Evidence } from '../schema.js'

export type EvidenceType = 'source_code' | 'log' | 'config' | 'environment' | 'test_result' | 'observation'

export interface NewEvidence {
  sessionId: string
  taskId?: string
  type: EvidenceType
  source: 'agent_a' | 'agent_b' | 'tool'
  location?: string
  description: string
  contentHash?: string
  confidence?: number
}

export async function insertEvidence(data: NewEvidence): Promise<Evidence> {
  const [record] = await db.insert(evidence).values({
    id: `EVD-${nanoid(6)}`,
    sessionId: data.sessionId,
    taskId: data.taskId,
    type: data.type,
    source: data.source,
    location: data.location,
    description: data.description,
    contentHash: data.contentHash,
    confidence: data.confidence ?? 1,
    createdAt: new Date().toISOString(),
  }).returning()
  if (!record) throw new Error('Failed to insert evidence')
  return record
}

export async function findEvidenceBySessionId(sessionId: string): Promise<Evidence[]> {
  return db.select().from(evidence).where(eq(evidence.sessionId, sessionId)).orderBy(asc(evidence.createdAt))
}

export async function findEvidenceById(id: string): Promise<Evidence | null> {
  const [record] = await db.select().from(evidence).where(eq(evidence.id, id)).limit(1)
  return record ?? null
}