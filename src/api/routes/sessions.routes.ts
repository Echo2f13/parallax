import { Router } from 'express'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import * as sessionManager from '../../core/sessions/session.manager.js'
import * as taskRepo from '../../db/repositories/task.repo.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import { Orchestrator } from '../../core/orchestrator/orchestrator.js'
import { ExecutionOrchestrator } from '../../core/orchestrator/execution.orchestrator.js'
import { createAgentAProvider, createAgentBProvider } from '../../agents/agent.factory.js'
import { config } from '../../config/config.js'
import * as evidenceRepo from '../../db/repositories/evidence.repo.js'
import * as experimentRepo from '../../db/repositories/experiment.repo.js'
import * as hypothesisRepo from '../../db/repositories/hypothesis.repo.js'
import { ReportGenerator } from '../../core/reports/report.generator.js'

const createSessionSchema = z.object({
  name: z.string().optional(),
  objective: z.string().min(1),
  agentAProvider: z.string().default('manual'),
  agentBModel: z.string().default(config.ollamaDefaultModel),
  workspacePath: z.string().optional(),
  maxIterations: z.number().int().positive().optional(),
  maxRuntimeSeconds: z.number().int().positive().optional(),
})

export const sessionsRouter = Router()

sessionsRouter.post('/sessions', async (request, response, next) => {
  try {
    const params = createSessionSchema.parse(request.body)
    const session = await sessionManager.createSession(params)
    response.status(201).json(session)
  } catch (error) {
    next(error)
  }
})

sessionsRouter.get('/sessions', async (_request, response, next) => {
  try {
    response.status(200).json(await sessionManager.listSessions())
  } catch (error) {
    next(error)
  }
})

sessionsRouter.get('/sessions/:id', async (request, response) => {
  try {
    response.status(200).json(await sessionManager.getSession(request.params.id))
  } catch (error) {
    if (error instanceof Error && error.message === 'Session not found') {
      response.status(404).json({ error: error.message, code: 'NOT_FOUND' })
      return
    }
    response.status(500).json({ error: 'Failed to retrieve session', code: 'INTERNAL_ERROR' })
  }
})

sessionsRouter.delete('/sessions/:id', async (request, response) => {
  try {
    await sessionManager.deleteSession(request.params.id)
    response.status(200).json({ message: 'Session deleted' })
  } catch (error) {
    if (error instanceof Error && error.message === 'Session not found') {
      response.status(404).json({ error: error.message, code: 'NOT_FOUND' })
      return
    }
    response.status(500).json({ error: 'Failed to delete session', code: 'INTERNAL_ERROR' })
  }
})

sessionsRouter.post('/sessions/:id/tasks', async (request, response, next) => {
  try {
    await sessionManager.getSession(request.params.id)
    const title = typeof request.body.title === 'string' ? request.body.title : 'Investigation task'
    const description = typeof request.body.description === 'string' ? request.body.description : undefined
    const task = await taskRepo.insertTask({
      id: nanoid(),
      sessionId: request.params.id,
      title,
      description,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    })
    response.status(201).json(task)
  } catch (error) {
    next(error)
  }
})

sessionsRouter.get('/sessions/:id/state', async (request, response, next) => {
  try {
    const session = await sessionManager.getSession(request.params.id)
    const [tasks, messages, evidence, experiments, hypotheses] = await Promise.all([
      taskRepo.findTasksBySessionId(request.params.id),
      messageRepo.findMessagesBySessionId(request.params.id),
      evidenceRepo.findEvidenceBySessionId(request.params.id),
      experimentRepo.findExperimentsBySessionId(request.params.id),
      hypothesisRepo.findHypothesesBySessionId(request.params.id),
    ])
    response.status(200).json({ session, tasks, messages, evidence, experiments, hypotheses })
  } catch (error) {
    next(error)
  }
})

sessionsRouter.get('/sessions/:id/messages', async (request, response, next) => {
  try {
    await sessionManager.getSession(request.params.id)
    response.status(200).json(await messageRepo.findMessagesBySessionId(request.params.id))
  } catch (error) {
    next(error)
  }
})

sessionsRouter.post('/sessions/:id/run', async (request, response, next) => {
  try {
    const session = await sessionManager.getSession(request.params.id)
    const objective = typeof request.body.objective === 'string' ? request.body.objective : session.objective
    const agentA = createAgentAProvider(session.agentAProvider)
    const agentB = createAgentBProvider(session.agentBModel)
    const orchestrator = new Orchestrator(agentA, agentB)
    void orchestrator.run(request.params.id, objective).catch(error => {
      console.error('[Parallax][API] Background run failed:', error instanceof Error ? error.message : 'Unknown error')
    })
    response.status(202).json({ message: 'Investigation started', sessionId: request.params.id })
  } catch (error) {
    next(error)
  }
})

sessionsRouter.post('/sessions/:id/stop', async (request, response, next) => {
  try {
    await sessionManager.updateStatus(request.params.id, 'STOPPED')
    response.status(200).json(await sessionManager.getSession(request.params.id))
  } catch (error) {
    next(error)
  }
})

// ── POST /sessions/:id/execute ────────────────────────────────────────────────
// Starts the ExecutionOrchestrator: Ollama drives the loop using execution tools.
// This is the job-application entry point. It does NOT use Agent A / manual relay.
// Requires the execution backend to be running (npm run start:api in naukri-autoapply)
// and connected via POST /providers/execution/connect.
sessionsRouter.post('/sessions/:id/execute', async (request, response, next) => {
  try {
    const session = await sessionManager.getSession(request.params.id)
    const objective = typeof request.body.objective === 'string' ? request.body.objective : session.objective
    // Give execution sessions a larger iteration budget than research sessions
    if ((session.maxIterations ?? 8) <= 8) {
      const { db }      = await import('../../db/client.js')
      const { sessions } = await import('../../db/schema.js')
      const { eq }      = await import('drizzle-orm')
      await db.update(sessions).set({ maxIterations: 50, maxRuntimeSeconds: 3600 }).where(eq(sessions.id, request.params.id))
    }
    const orchestrator = new ExecutionOrchestrator()
    void orchestrator.run(request.params.id, objective).catch(error => {
      console.error('[Parallax][API] Background execute failed:', error instanceof Error ? error.message : 'Unknown error')
    })
    response.status(202).json({ message: 'Execution started', sessionId: request.params.id, mode: 'execution' })
  } catch (error) {
    next(error)
  }
})

sessionsRouter.get('/sessions/:id/evidence', async (request, response, next) => {
  try {
    await sessionManager.getSession(request.params.id)
    response.status(200).json(await evidenceRepo.findEvidenceBySessionId(request.params.id))
  } catch (error) { next(error) }
})

sessionsRouter.get('/sessions/:id/experiments', async (request, response, next) => {
  try {
    await sessionManager.getSession(request.params.id)
    response.status(200).json(await experimentRepo.findExperimentsBySessionId(request.params.id))
  } catch (error) { next(error) }
})

sessionsRouter.get('/sessions/:id/hypotheses', async (request, response, next) => {
  try {
    await sessionManager.getSession(request.params.id)
    response.status(200).json(await hypothesisRepo.findHypothesesBySessionId(request.params.id))
  } catch (error) { next(error) }
})

sessionsRouter.get('/sessions/:id/report', async (request, response) => {
  try {
    const session = await sessionManager.getSession(request.params.id)
    if (!['CONCLUDED', 'STOPPED', 'BLOCKED', 'ERROR'].includes(session.status)) {
      response.status(400).json({ error: 'Session is still running', code: 'SESSION_RUNNING' })
      return
    }
    const report = await new ReportGenerator().generate(request.params.id)
    if (request.query.format === 'markdown') {
      response.type('text/markdown').status(200).send(new ReportGenerator().toMarkdown(report))
      return
    }
    response.status(200).json(report)
  } catch (error) {
    if (error instanceof Error && error.message === 'Session not found') { response.status(404).json({ error: error.message, code: 'NOT_FOUND' }); return }
    response.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate report', code: 'INTERNAL_ERROR' })
  }
})