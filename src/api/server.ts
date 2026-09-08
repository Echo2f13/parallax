import express, { type ErrorRequestHandler } from 'express'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { healthRouter } from './routes/health.routes.js'
import { sessionsRouter } from './routes/sessions.routes.js'
import { providersRouter } from './routes/providers.routes.js'

export const app = express()

app.use(express.json())
const currentDirectory = fileURLToPath(new URL('.', import.meta.url))
app.use(express.static(join(currentDirectory, '../../web')))
app.get('/', (_request, response) => {
  response.sendFile(join(currentDirectory, '../../web/index.html'))
})
app.use(healthRouter)
app.use(sessionsRouter)
app.use(providersRouter)

const errorHandler: ErrorRequestHandler = (err, _request, response, _next) => {
  const error = err instanceof Error ? err : new Error('Unknown error')
  console.error('[Parallax][API] Error:', error.message)
  response.status(500).json({ error: error.message, code: 'INTERNAL_ERROR' })
}

app.use(errorHandler)