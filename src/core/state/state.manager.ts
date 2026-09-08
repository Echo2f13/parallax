import type { SessionStatus } from '../sessions/session.manager.js'

const transitions: Record<SessionStatus, SessionStatus[]> = {
  CREATED: ['PLANNING', 'STOPPED', 'ERROR'],
  PLANNING: ['INVESTIGATING', 'CONCLUDED', 'STOPPED', 'ERROR'],
  INVESTIGATING: ['REVIEWING', 'CONCLUDED', 'STOPPED', 'ERROR'],
  REVIEWING: ['EXPERIMENT_REQUIRED', 'INVESTIGATING', 'CONCLUDED', 'BLOCKED', 'STOPPED', 'ERROR'],
  EXPERIMENT_REQUIRED: ['INVESTIGATING', 'CONCLUDED', 'STOPPED', 'ERROR'],
  CONCLUDED: [], STOPPED: [], BLOCKED: [], ERROR: [],
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Illegal state transition: ${from} → ${to}`)
}