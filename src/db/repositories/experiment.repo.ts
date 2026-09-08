import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../client.js'
import { experiments, experimentResults } from '../schema.js'
import type { Experiment } from '../schema.js'

export interface NewExperiment {
  sessionId: string
  hypothesisId?: string
  objective: string
  requestedBy: 'agent_a'
  executedBy: 'agent_b'
  actions: string[]
  expectedResult?: string
}

export interface ExperimentResult {
  actualResult: string
  status: 'completed' | 'failed'
  evidenceIds?: string[]
  conclusion?: string
}

export async function insertExperiment(data: NewExperiment): Promise<Experiment> {
  const [record] = await db.insert(experiments).values({
    id: `EXP-${nanoid(6)}`,
    sessionId: data.sessionId,
    hypothesisId: data.hypothesisId,
    objective: data.objective,
    requestedBy: data.requestedBy,
    executedBy: data.executedBy,
    actions: JSON.stringify(data.actions),
    expectedResult: data.expectedResult,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }).returning()
  if (!record) throw new Error('Failed to insert experiment')
  return record
}

export async function completeExperiment(id: string, result: ExperimentResult): Promise<void> {
  const completedAt = new Date().toISOString()
  const updated = await db.update(experiments).set({
    actualResult: result.actualResult,
    status: result.status,
    evidenceIds: result.evidenceIds ? JSON.stringify(result.evidenceIds) : undefined,
    conclusion: result.conclusion,
    completedAt,
  }).where(eq(experiments.id, id)).returning({ id: experiments.id, sessionId: experiments.sessionId })
  if (updated.length === 0) throw new Error('Experiment not found')
  await db.insert(experimentResults).values({
    id: `EXP-RESULT-${nanoid(6)}`,
    experimentId: id,
    actualResult: result.actualResult,
    status: result.status,
    evidenceIds: result.evidenceIds ? JSON.stringify(result.evidenceIds) : undefined,
    conclusion: result.conclusion,
    createdAt: completedAt,
  })
}

export async function findExperimentsBySessionId(sessionId: string): Promise<Experiment[]> {
  return db.select().from(experiments).where(eq(experiments.sessionId, sessionId)).orderBy(asc(experiments.createdAt))
}