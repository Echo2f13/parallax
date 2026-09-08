import type { Session } from '../../db/schema.js'

export interface TerminationCheck {
  shouldTerminate: boolean
  reason?: string
}

export class TerminationEngine {
  check(session: Session, iteration: number, messageCount: number, startedAt: Date): TerminationCheck {
    if (iteration >= (session.maxIterations ?? 0)) return { shouldTerminate: true, reason: `max_iterations reached: ${iteration}` }
    if ((Date.now() - startedAt.getTime()) / 1000 >= (session.maxRuntimeSeconds ?? 0)) return { shouldTerminate: true, reason: `max_runtime_seconds reached: ${session.maxRuntimeSeconds}` }
    if (messageCount >= (session.maxAgentMessages ?? 0)) return { shouldTerminate: true, reason: `max_agent_messages reached: ${messageCount}` }
    return { shouldTerminate: false }
  }
}