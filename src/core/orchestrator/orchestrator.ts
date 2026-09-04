import { nanoid } from 'nanoid'
import { config } from '../../config/config.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import * as taskRepo from '../../db/repositories/task.repo.js'
import * as sessionManager from '../sessions/session.manager.js'
import { OllamaAdapter } from '../../agents/ollama/ollama.adapter.js'
import type { AgentProvider } from '../../agents/interfaces/agent.provider.js'
import type { InvestigationRequest } from '../../protocol/messages.js'

export class Orchestrator {
  private readonly agent: AgentProvider

  constructor(agent: AgentProvider = new OllamaAdapter()) {
    this.agent = agent
  }

  async run(sessionId: string, taskDescription: string): Promise<void> {
    const session = await sessionManager.getSession(sessionId)
    const taskId = nanoid()
    try {
      await taskRepo.insertTask({
        id: taskId,
        sessionId,
        title: 'Investigation run',
        description: taskDescription,
        status: 'RUNNING',
        createdAt: new Date().toISOString(),
      })
      await this.transition(sessionId, 'PLANNING')
      const request: InvestigationRequest = {
        message_type: 'investigation_request',
        protocol_version: '1.0',
        session_id: sessionId,
        task_id: taskId,
        sender: 'orchestrator',
        recipient: 'agent_b',
        objective: taskDescription,
        hypotheses: [],
        requested_actions: [],
        required_output: ['observations', 'evidence', 'conclusions'],
        context: {
          current_state: 'PLANNING',
          iteration: 0,
          confirmed_facts: [],
          unresolved_questions: [],
          recent_experiments: [],
        },
        constraints: {
          max_tool_calls: config.maxAgentMessages,
          workspace_path: session.workspacePath ?? config.workspacePath,
        },
        output_schema: {
          type: 'InvestigationResult',
          required: ['status', 'observations', 'evidence', 'conclusions'],
        },
      }
      await this.transition(sessionId, 'INVESTIGATING')
      const response = await this.agent.send({ request, model: session.agentBModel, sessionId })
      await messageRepo.insertMessage({
        id: nanoid(),
        sessionId,
        taskId,
        sender: 'agent_b',
        messageType: 'investigation_result',
        payload: JSON.stringify(response.result),
        createdAt: new Date().toISOString(),
      })
      await this.transition(sessionId, 'CONCLUDED')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown orchestrator error'
      await sessionManager.updateStatus(sessionId, 'ERROR', message)
      await this.logSystemMessage(sessionId, `Run failed: ${message}`)
      throw error
    }
  }

  private async transition(sessionId: string, status: sessionManager.SessionStatus): Promise<void> {
    await sessionManager.updateStatus(sessionId, status)
    await this.logSystemMessage(sessionId, `Session transitioned to ${status}`)
  }

  private async logSystemMessage(sessionId: string, message: string): Promise<void> {
    await messageRepo.insertMessage({
      id: nanoid(),
      sessionId,
      sender: 'orchestrator',
      messageType: 'system',
      payload: JSON.stringify({ message }),
      createdAt: new Date().toISOString(),
    })
  }
}