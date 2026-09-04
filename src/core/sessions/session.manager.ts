import { nanoid } from 'nanoid'
import { config } from '../../config/config.js'
import * as sessionRepo from '../../db/repositories/session.repo.js'
import type { Session } from '../../db/schema.js'

export interface CreateSessionParams {
  name?: string
  objective: string
  agentAProvider: string
  agentBModel: string
  workspacePath?: string
  maxIterations?: number
  maxRuntimeSeconds?: number
}

export type SessionStatus =
  | 'CREATED'
  | 'PLANNING'
  | 'INVESTIGATING'
  | 'REVIEWING'
  | 'EXPERIMENT_REQUIRED'
  | 'CONCLUDED'
  | 'STOPPED'
  | 'BLOCKED'
  | 'ERROR'

export async function createSession(params: CreateSessionParams): Promise<Session> {
  return sessionRepo.insertSession({
    id: nanoid(),
    name: params.name,
    objective: params.objective,
    status: 'CREATED',
    agentAProvider: params.agentAProvider,
    agentBModel: params.agentBModel,
    workspacePath: params.workspacePath ?? config.workspacePath,
    maxIterations: params.maxIterations ?? config.maxIterations,
    maxRuntimeSeconds: params.maxRuntimeSeconds ?? config.maxRuntimeSeconds,
    maxAgentMessages: config.maxAgentMessages,
    createdAt: new Date().toISOString(),
  })
}

export async function getSession(id: string): Promise<Session> {
  const session = await sessionRepo.findSessionById(id)
  if (!session) throw new Error('Session not found')
  return session
}

export async function listSessions(): Promise<Session[]> {
  return sessionRepo.findAllSessions()
}

export async function updateStatus(id: string, status: SessionStatus, reason?: string): Promise<void> {
  await sessionRepo.updateSessionStatus(id, status, reason)
}

export async function deleteSession(id: string): Promise<void> {
  await sessionRepo.deleteSessionById(id)
}