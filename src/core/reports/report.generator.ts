import * as contradictionRepo from '../../db/repositories/contradiction.repo.js'
import * as evidenceRepo from '../../db/repositories/evidence.repo.js'
import * as experimentRepo from '../../db/repositories/experiment.repo.js'
import * as hypothesisRepo from '../../db/repositories/hypothesis.repo.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import * as sessionManager from '../sessions/session.manager.js'
import * as unknownRepo from '../../db/repositories/unknown.repo.js'

export interface InvestigationReport {
  meta: { session_id: string; session_name: string; objective: string; status: string; started_at: string; concluded_at?: string; termination_reason?: string; total_iterations: number; total_messages: number; agent_a_provider: string; agent_b_model: string }
  summary: string
  confirmed_facts: string[]
  hypotheses: { id: string; statement: string; status: string; confidence: number; proposed_by: string }[]
  experiments: { id: string; objective: string; expected_result?: string; actual_result?: string; status: string; conclusion?: string }[]
  evidence: { id: string; type: string; location?: string; description: string; confidence: number; source: string }[]
  contradictions: { id: string; description: string; status: string }[]
  conclusions: string[]
  remaining_unknowns: string[]
  recommended_next_steps: string[]
}

export class ReportGenerator {
  async generate(sessionId: string): Promise<InvestigationReport> {
    const session = await sessionManager.getSession(sessionId)
    const [messages, evidence, hypotheses, experiments, contradictions, unknowns] = await Promise.all([
      messageRepo.findMessagesBySessionId(sessionId), evidenceRepo.findEvidenceBySessionId(sessionId), hypothesisRepo.findHypothesesBySessionId(sessionId),
      experimentRepo.findExperimentsBySessionId(sessionId), contradictionRepo.findContradictionsBySessionId(sessionId), unknownRepo.findUnknownsBySessionId(sessionId),
    ])
    const conclusions: string[] = []
    for (const message of messages.filter(item => item.sender === 'agent_a')) {
      try {
        const payload: unknown = JSON.parse(message.payload)
        if (typeof payload === 'object' && payload !== null && 'conclusions' in payload && Array.isArray(payload.conclusions)) {
          for (const conclusion of payload.conclusions) {
            if (typeof conclusion === 'object' && conclusion !== null && 'statement' in conclusion && typeof conclusion.statement === 'string') conclusions.push(conclusion.statement)
          }
        }
      } catch { continue }
    }
    const totalIterations = messages.filter(message => message.sender === 'agent_b').length
    const summary = conclusions.at(-1) ?? `Investigation completed after ${totalIterations} iterations. ${evidence.length} evidence items collected. ${experiments.length} experiments performed.`
    return {
      meta: { session_id: session.id, session_name: session.name ?? '', objective: session.objective, status: session.status, started_at: session.createdAt, concluded_at: session.terminatedAt ?? undefined, termination_reason: session.terminationReason ?? undefined, total_iterations: totalIterations, total_messages: messages.length, agent_a_provider: session.agentAProvider, agent_b_model: session.agentBModel },
      summary,
      confirmed_facts: evidence.filter(item => (item.confidence ?? 0) >= 0.9).map(item => item.description),
      hypotheses: hypotheses.map(item => ({ id: item.id, statement: item.statement, status: item.status, confidence: item.confidence ?? 0.5, proposed_by: item.proposedBy })),
      experiments: experiments.map(item => ({ id: item.id, objective: item.objective, expected_result: item.expectedResult ?? undefined, actual_result: item.actualResult ?? undefined, status: item.status, conclusion: item.conclusion ?? undefined })),
      evidence: evidence.map(item => ({ id: item.id, type: item.type, location: item.location ?? undefined, description: item.description, confidence: item.confidence ?? 1, source: item.source })),
      contradictions: contradictions.map(item => ({ id: item.id, description: item.description, status: item.status })),
      conclusions,
      remaining_unknowns: unknowns.filter(item => item.status === 'open').map(item => item.question),
      recommended_next_steps: unknowns.filter(item => item.status === 'open').map(item => `Investigate: ${item.question}`),
    }
  }

  toMarkdown(report: InvestigationReport): string {
    const bullets = (items: string[]): string => items.length ? items.map(item => `- ${item}`).join('\n') : '- None'
    const hypotheses = report.hypotheses.length ? report.hypotheses.map(item => `| ${item.id} | ${item.statement} | ${item.status} | ${item.confidence} |`).join('\n') : '| None | | | |'
    return `# Investigation Report\n**Objective:** ${report.meta.objective}\n**Status:** ${report.meta.status}\n**Date:** ${report.meta.concluded_at ?? report.meta.started_at}\n\n## Summary\n${report.summary}\n\n## Confirmed Facts\n${bullets(report.confirmed_facts)}\n\n## Hypotheses\n| ID | Statement | Status | Confidence |\n|---|---|---|---|\n${hypotheses}\n\n## Experiments\n${bullets(report.experiments.map(item => `${item.objective}: ${item.actual_result ?? item.status}`))}\n\n## Evidence\n${bullets(report.evidence.map(item => `${item.type}${item.location ? ` (${item.location})` : ''}: ${item.description}`))}\n\n## Contradictions\n${bullets(report.contradictions.map(item => `${item.status}: ${item.description}`))}\n\n## Conclusions\n${bullets(report.conclusions)}\n\n## Remaining Unknowns\n${bullets(report.remaining_unknowns)}\n\n## Recommended Next Steps\n${bullets(report.recommended_next_steps)}\n`
  }

  toJSON(report: InvestigationReport): string { return JSON.stringify(report, null, 2) }
}