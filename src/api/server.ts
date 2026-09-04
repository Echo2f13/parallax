import express, { type ErrorRequestHandler } from 'express'
import { healthRouter } from './routes/health.routes.js'
import { sessionsRouter } from './routes/sessions.routes.js'

export const app = express()

app.use(express.json())
app.use(healthRouter)
app.use(sessionsRouter)

const errorHandler: ErrorRequestHandler = (err, _request, response, _next) => {
  const error = err instanceof Error ? err : new Error('Unknown error')
  console.error('[Parallax][API] Error:', error.message)
  response.status(500).json({ error: error.message, code: 'INTERNAL_ERROR' })
}

app.use(errorHandler)