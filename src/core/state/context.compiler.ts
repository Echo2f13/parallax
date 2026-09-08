import * as contradictionRepo from '../../db/repositories/contradiction.repo.js'
import * as evidenceRepo from '../../db/repositories/evidence.repo.js'
import * as experimentRepo from '../../db/repositories/experiment.repo.js'
import * as hypothesisRepo from '../../db/repositories/hypothesis.repo.js'
import * as sessionManager from '../sessions/session.manager.js'
import * as unknownRepo from '../../db/repositories/unknown.repo.js'

export interface HypothesisSummary { id: string; statement: string; confidence: number; status?: string }
export interface ExperimentSummary { id: string; objective: string; status: string; actual_result?: string; conclusion?: string }
export interface EvidenceSummary { id: string; type: string; location?: string; description: string; confidence: number; source: string }
export interface ContradictionSummary { id: string; description: string; status: string }

export interface AgentContext {
  objective: string
  current_state: string
  iteration: number
  hypotheses: HypothesisSummary[]
  confirmed_facts: string[]
  recent_experiments: ExperimentSummary[]
  latest_evidence: EvidenceSummary[]
  unresolved_questions: string[]
  contradictions: ContradictionSummary[]
  output_schema: object
}

export class ContextCompiler {
  async buildForAgentA(sessionId: string, iteration: number): Promise<AgentContext> {
    return this.build(sessionId, iteration, 'PLANNING')
  }

  async buildForAgentB(sessionId: string, iteration: number): Promise<AgentContext> {
    return this.build(sessionId, iteration, 'INVESTIGATING')
  }

  private async build(sessionId: string, iteration: number, state: string): Promise<AgentContext> {
    const session = await sessionManager.getSession(sessionId)
    const [hypotheses, experiments, evidence, contradictions, unknowns] = await Promise.all([
      hypothesisRepo.findHypothesesBySessionId(sessionId),
      experimentRepo.findExperimentsBySessionId(sessionId),
      evidenceRepo.findEvidenceBySessionId(sessionId),
      contradictionRepo.findContradictionsBySessionId(sessionId),
      unknownRepo.findUnknownsBySessionId(sessionId),
    ])
    return {
      objective: session.objective,
      current_state: state,
      iteration,
      hypotheses: hypotheses.filter(item => item.status === 'active').slice(0, 10).map(item => ({ id: item.id, statement: item.statement, confidence: item.confidence ?? 0.5, status: item.status })),
      confirmed_facts: evidence.filter(item => (item.confidence ?? 0) >= 0.9).slice(0, 20).map(item => item.description),
      recent_experiments: experiments.slice(-3).map(item => ({ id: item.id, objective: item.objective, status: item.status, actual_result: item.actualResult ?? undefined, conclusion: item.conclusion ?? undefined })),
      latest_evidence: evidence.slice(-15).map(item => ({ id: item.id, type: item.type, location: item.location ?? undefined, description: item.description, confidence: item.confidence ?? 1, source: item.source })),
      unresolved_questions: unknowns.filter(item => item.status === 'open').slice(0, 10).map(item => item.question),
      contradictions: contradictions.filter(item => item.status === 'unresolved').map(item => ({ id: item.id, description: item.description, status: item.status })),
      output_schema: { type: 'InvestigationResult', required: ['status', 'observations', 'evidence', 'experiments', 'conclusions', 'recommended_next_action'] },
    }
  }
}