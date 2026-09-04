import { Router } from 'express'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import * as sessionManager from '../../core/sessions/session.manager.js'
import * as taskRepo from '../../db/repositories/task.repo.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import { Orchestrator } from '../../core/orchestrator/orchestrator.js'
import { config } from '../../config/config.js'

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
    const [tasks, messages] = await Promise.all([
      taskRepo.findTasksBySessionId(request.params.id),
      messageRepo.findMessagesBySessionId(request.params.id),
    ])
    response.status(200).json({ session, tasks, messages })
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
    void new Orchestrator().run(request.params.id, objective).catch(error => {
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