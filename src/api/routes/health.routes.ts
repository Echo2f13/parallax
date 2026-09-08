import { Router } from 'express'
import { OllamaAdapter } from '../../agents/ollama/ollama.adapter.js'
import { config } from '../../config/config.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_request, response) => {
  const ollama = await new OllamaAdapter().healthCheck()
  response.status(200).json({ status: 'ok', ollama, timestamp: new Date().toISOString() })
})

healthRouter.get('/models', async (_request, response) => {
  try {
    const ollamaResponse = await fetch(`${config.ollamaBaseUrl}/api/tags`)
    if (!ollamaResponse.ok) {
      response.status(502).json({ error: 'Could not reach Ollama', models: [] })
      return
    }
    const payload: unknown = await ollamaResponse.json()
    const models = typeof payload === 'object' && payload !== null && 'models' in payload && Array.isArray(payload.models)
      ? payload.models
      : []
    response.status(200).json({ models })
  } catch {
    response.status(502).json({ error: 'Ollama unreachable', models: [] })
  }
})