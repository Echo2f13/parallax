import { Router } from 'express'
import { OllamaAdapter } from '../../agents/ollama/ollama.adapter.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_request, response) => {
  const ollama = await new OllamaAdapter().healthCheck()
  response.status(200).json({ status: 'ok', ollama, timestamp: new Date().toISOString() })
})