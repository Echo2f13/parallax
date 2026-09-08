import { nanoid } from 'nanoid'
import { config } from '../../config/config.js'
import * as evidenceRepo from '../../db/repositories/evidence.repo.js'
import * as experimentRepo from '../../db/repositories/experiment.repo.js'
import * as hypothesisRepo from '../../db/repositories/hypothesis.repo.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import * as taskRepo from '../../db/repositories/task.repo.js'
import { ContradictionDetector } from '../state/contradiction.detector.js'
import { assertTransition } from '../state/state.manager.js'
import { ContextCompiler, type AgentContext } from '../state/context.compiler.js'
import { TerminationEngine } from '../termination/termination.engine.js'
import * as sessionManager from '../sessions/session.manager.js'
import { ManualRelayAdapter } from '../../agents/chatgpt/manual.adapter.js'
import type { AgentProvider, AgentRequest, AgentResponse } from '../../agents/interfaces/agent.provider.js'
import type { InvestigationRequest, InvestigationResult } from '../../protocol/messages.js'

const terminalStatuses: sessionManager.SessionStatus[] = ['CONCLUDED', 'STOPPED', 'BLOCKED', 'ERROR']

export class Orchestrator {
  private readonly terminationEngine = new TerminationEngine()
  private readonly contradictionDetector = new ContradictionDetector()
  private readonly contextCompiler = new ContextCompiler()

  constructor(private readonly agentA: AgentProvider, private readonly agentB: AgentProvider) {}

  async run(sessionId: string, objective: string): Promise<void> {
    const session = await sessionManager.getSession(sessionId)
    const taskId = nanoid()
    const startedAt = new Date()
    let iteration = 0
    let messageCount = 0
    let taskCreated = false
    try {
      await taskRepo.insertTask({ id: taskId, sessionId, title: 'Two-agent investigation', description: objective, status: 'RUNNING', createdAt: startedAt.toISOString() })
      taskCreated = true
      await this.transition(sessionId, 'PLANNING')
      const planningCheck = this.terminationEngine.check(session, iteration, messageCount, startedAt)
      if (planningCheck.shouldTerminate) {
        await this.finish(sessionId, taskId, planningCheck.reason ?? 'Termination condition reached', 'CONCLUDED')
        return
      }
      const planningContext = await this.contextCompiler.buildForAgentA(sessionId, iteration)
      const planningRequest = this.buildRequestFromContext(sessionId, taskId, 'agent_a', planningContext, ['hypotheses', 'investigation_plan', 'questions_for_agent_b'], session.workspacePath ?? config.workspacePath)
      const planningResponse = await this.callAgentASafely({ request: planningRequest, sessionId })
      messageCount += 1
      await this.storeAgentMessage(sessionId, taskId, 'agent_a', planningResponse)
      await this.recordArtifacts(sessionId, taskId, planningResponse.result)
      let hypotheses = await hypothesisRepo.findHypothesesBySessionId(sessionId)

      while (true) {
        const currentSession = await sessionManager.getSession(sessionId)
        if (terminalStatuses.includes(currentSession.status as sessionManager.SessionStatus)) break
        const beforeInvestigation = this.terminationEngine.check(currentSession, iteration, messageCount, startedAt)
        if (beforeInvestigation.shouldTerminate) {
          await this.finish(sessionId, taskId, beforeInvestigation.reason ?? 'Termination condition reached', 'CONCLUDED')
          break
        }
        await this.transition(sessionId, 'INVESTIGATING')
        const investigationContext = await this.contextCompiler.buildForAgentB(sessionId, iteration)
        const investigationRequest = this.buildRequestFromContext(sessionId, taskId, 'agent_b', investigationContext, ['observations', 'evidence', 'experiments', 'conclusions'], currentSession.workspacePath ?? config.workspacePath)
        const investigationResponse = await this.agentB.send({ request: investigationRequest, model: currentSession.agentBModel, sessionId })
        messageCount += 1
        iteration += 1
        await this.storeAgentMessage(sessionId, taskId, 'agent_b', investigationResponse)
        await this.recordArtifacts(sessionId, taskId, investigationResponse.result)
        const afterInvestigation = this.terminationEngine.check(currentSession, iteration, messageCount, startedAt)
        if (afterInvestigation.shouldTerminate) {
          await this.finish(sessionId, taskId, afterInvestigation.reason ?? 'Termination condition reached', 'CONCLUDED')
          break
        }
        await this.transition(sessionId, 'REVIEWING')
        const reviewContext = await this.contextCompiler.buildForAgentA(sessionId, iteration)
        const reviewRequest = this.buildRequestFromContext(sessionId, taskId, 'agent_a', reviewContext, ['conclusions', 'recommended_next_action', 'hypothesis_assessment'], currentSession.workspacePath ?? config.workspacePath)
        const reviewResponse = await this.callAgentASafely({ request: reviewRequest, sessionId })
        messageCount += 1
        await this.storeAgentMessage(sessionId, taskId, 'agent_a', reviewResponse)
        await this.recordArtifacts(sessionId, taskId, reviewResponse.result)
        hypotheses = await hypothesisRepo.findHypothesesBySessionId(sessionId)
        const action = reviewResponse.result.recommended_next_action
        if (action === 'CONCLUDE') { await this.finish(sessionId, taskId, 'Agent A recommended conclusion', 'CONCLUDED'); break }
        if (action === 'BLOCKED') { await this.finish(sessionId, taskId, 'Agent A reported the investigation is blocked', 'BLOCKED'); break }
        if (action === 'REVISE_HYPOTHESIS') for (const hypothesis of hypotheses) await hypothesisRepo.updateHypothesisStatus(hypothesis.id, 'superseded')
        if (action === 'EXPERIMENT_REQUIRED') await this.transition(sessionId, 'EXPERIMENT_REQUIRED')
      }
      if (taskCreated) await taskRepo.updateTaskStatus(taskId, 'COMPLETED')
      await this.logSystemMessage(sessionId, `Investigation finished after ${iteration} iteration(s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown orchestrator error'
      await sessionManager.updateStatus(sessionId, 'ERROR', message)
      await this.logSystemMessage(sessionId, `Run failed: ${message}`)
      if (taskCreated) await taskRepo.updateTaskStatus(taskId, 'FAILED')
      throw error
    }
  }

  private buildRequest(sessionId: string, taskId: string, objective: string, recipient: 'agent_a' | 'agent_b', state: string, iteration: number, hypotheses: InvestigationRequest['hypotheses'], requestedActions: InvestigationRequest['requested_actions'], requiredOutput: string[], workspacePath: string, confirmedFacts: string[] = []): InvestigationRequest {
    return { message_type: 'investigation_request', protocol_version: '1.0', session_id: sessionId, task_id: taskId, sender: 'orchestrator', recipient, objective, hypotheses, requested_actions: requestedActions, required_output: requiredOutput, context: { current_state: state, iteration, confirmed_facts: confirmedFacts, unresolved_questions: [], recent_experiments: [] }, constraints: { max_tool_calls: config.maxAgentMessages, workspace_path: workspacePath }, output_schema: { type: 'InvestigationResult', required: ['status', 'observations', 'evidence', 'conclusions', 'recommended_next_action'] } }
  }

  private buildRequestFromContext(sessionId: string, taskId: string, recipient: 'agent_a' | 'agent_b', context: AgentContext, requiredOutput: string[], workspacePath: string): InvestigationRequest {
    return {
      message_type: 'investigation_request', protocol_version: '1.0', session_id: sessionId, task_id: taskId,
      sender: 'orchestrator', recipient, objective: context.objective,
      hypotheses: context.hypotheses.map(hypothesis => ({ id: hypothesis.id, statement: hypothesis.statement, confidence: hypothesis.confidence })),
      requested_actions: [], required_output: requiredOutput,
      context: { current_state: context.current_state, iteration: context.iteration, confirmed_facts: context.confirmed_facts, unresolved_questions: context.unresolved_questions, recent_experiments: [] },
      constraints: { max_tool_calls: config.maxAgentMessages, workspace_path: workspacePath }, output_schema: context.output_schema as Record<string, unknown>,
    }
  }

  private async storeAgentMessage(sessionId: string, taskId: string, sender: 'agent_a' | 'agent_b', response: AgentResponse): Promise<void> {
    await messageRepo.insertMessage({ id: nanoid(), sessionId, taskId, sender, messageType: 'investigation_result', payload: JSON.stringify(response.result), createdAt: new Date().toISOString() })
  }

  private async callAgentASafely(request: AgentRequest): Promise<AgentResponse> {
    try {
      return await this.agentA.send(request)
    } catch (error) {
      if (this.agentA.name !== 'browser') throw error
      console.warn('[Parallax][Orchestrator] Agent A browser call failed, falling back to ManualRelayAdapter')
      return new ManualRelayAdapter().send(request)
    }
  }

  private async recordArtifacts(sessionId: string, taskId: string, result: InvestigationResult): Promise<void> {
    if (result.agent_assessment === 'disagree' && result.disagreement_reason) {
      await this.logSystemMessage(sessionId, `${result.sender} disagreement: ${result.disagreement_reason}`)
      const disagreement = await evidenceRepo.insertEvidence({ sessionId, taskId, type: 'observation', source: result.sender, description: `${result.sender} disagrees: ${result.disagreement_reason}`, confidence: 0.8 })
      await this.contradictionDetector.checkForContradictions(sessionId, disagreement)
      if (result.sender === 'agent_a') {
        const activeHypotheses = await hypothesisRepo.findHypothesesBySessionId(sessionId)
        for (const hypothesis of activeHypotheses.filter(item => item.status === 'active')) await hypothesisRepo.updateHypothesisStatus(hypothesis.id, 'superseded', [disagreement.id])
        await hypothesisRepo.insertHypothesis({ sessionId, statement: result.disagreement_reason, proposedBy: 'agent_a', evidenceIds: [disagreement.id] })
      }
    }
    for (const item of result.evidence) {
      const evidence = await evidenceRepo.insertEvidence({ sessionId, taskId, type: this.toEvidenceType(item.type), source: result.sender, location: item.location, description: item.description, confidence: item.confidence })
      await this.contradictionDetector.checkForContradictions(sessionId, evidence)
    }
    for (const item of result.experiments) {
      const experiment = await experimentRepo.insertExperiment({ sessionId, objective: item.action, requestedBy: 'agent_a', executedBy: 'agent_b', actions: [item.action] })
      await experimentRepo.completeExperiment(experiment.id, { actualResult: item.result, status: 'completed' })
    }
    for (const item of result.observations) await hypothesisRepo.insertHypothesis({ sessionId, statement: item.statement, proposedBy: result.sender })
  }

  private toEvidenceType(type: string): evidenceRepo.EvidenceType {
    const allowed: evidenceRepo.EvidenceType[] = ['source_code', 'log', 'config', 'environment', 'test_result', 'observation']
    return allowed.includes(type as evidenceRepo.EvidenceType) ? type as evidenceRepo.EvidenceType : 'observation'
  }

  private async transition(sessionId: string, status: sessionManager.SessionStatus): Promise<void> {
    const session = await sessionManager.getSession(sessionId)
    assertTransition(session.status as sessionManager.SessionStatus, status)
    await sessionManager.updateStatus(sessionId, status)
    await this.logSystemMessage(sessionId, `Session transitioned to ${status}`)
  }

  private async finish(sessionId: string, taskId: string, reason: string, status: 'CONCLUDED' | 'BLOCKED'): Promise<void> {
    await this.transition(sessionId, status)
    await taskRepo.updateTaskStatus(taskId, 'COMPLETED')
    await this.logSystemMessage(sessionId, `Investigation terminated: ${reason}`)
  }

  private async logSystemMessage(sessionId: string, message: string): Promise<void> {
    await messageRepo.insertMessage({ id: nanoid(), sessionId, sender: 'orchestrator', messageType: 'system', payload: JSON.stringify({ message }), createdAt: new Date().toISOString() })
  }
}
