import { Router } from 'express'
import { ChatGPTBrowserAdapter } from '../../agents/chatgpt/browser.adapter.js'
import { clearChatGPTAdapter, getChatGPTAdapter, setChatGPTAdapter } from '../../agents/adapter.store.js'
import { config } from '../../config/config.js'
import { NaukriAdapter } from '../../execution/adapters/naukri.adapter.js'
import { setExecutionProvider, getExecutionProvider, clearExecutionProvider } from '../../execution/execution.store.js'
import { ChatGPTReasoningProvider, ManualReasoningProvider } from '../../reasoning/providers/chatgpt.reasoning.provider.js'
import { setReasoningProvider, getReasoningProvider, clearReasoningProvider } from '../../reasoning/reasoning.store.js'

export const providersRouter = Router()

// ── ChatGPT browser provider ─────────────────────────────────────────────────

providersRouter.post('/providers/chatgpt/connect', async (request, response) => {
  try {
    const conversationId = typeof request.body.conversationId === 'string' ? request.body.conversationId : ''
    if (!conversationId) { response.status(400).json({ error: 'conversationId is required', code: 'INVALID_INPUT' }); return }
    config.chatgptConversationId = conversationId
    console.log(`[Parallax][API] POST /providers/chatgpt/connect received for conversation ${conversationId}`)
    const adapter = new ChatGPTBrowserAdapter(conversationId, config.chromeUserDataDir, config.chromeProfile, config.browserChannel)
    await adapter.connect()
    setChatGPTAdapter(adapter)
    // Also wire up the reasoning provider automatically when ChatGPT connects
    setReasoningProvider(new ChatGPTReasoningProvider())
    console.log(`[Parallax][API] ChatGPT connected successfully!`)
    response.status(200).json({ ok: true })
  } catch (error) {
    console.error(`[Parallax][API] ChatGPT connect failed:`, error)
    response.status(400).json({ error: error instanceof Error ? error.message : 'Could not connect ChatGPT browser', code: 'BROWSER_CONNECTION_FAILED' })
  }
})

providersRouter.get('/providers/chatgpt/status', async (_request, response) => {
  const adapter = getChatGPTAdapter()
  response.status(200).json(adapter ? await adapter.healthCheck() : { ok: false, message: 'Browser not connected' })
})

providersRouter.post('/providers/chatgpt/disconnect', async (_request, response) => {
  const adapter = getChatGPTAdapter()
  if (adapter) await adapter.disconnect()
  clearChatGPTAdapter()
  clearReasoningProvider()
  response.status(200).json({ ok: true })
})

// ── Ollama config ─────────────────────────────────────────────────────────────

providersRouter.post('/providers/ollama/config', (request, response) => {
  if (typeof request.body.model !== 'string' || !request.body.model) { response.status(400).json({ error: 'model is required', code: 'INVALID_INPUT' }); return }
  config.ollamaDefaultModel = request.body.model
  response.status(200).json({ ok: true, model: config.ollamaDefaultModel })
})

// ── Execution backend provider ────────────────────────────────────────────────

providersRouter.post('/providers/execution/connect', async (request, response) => {
  try {
    const url = typeof request.body.url === 'string' ? request.body.url : config.executionApiUrl
    const adapter = new NaukriAdapter(url)
    const health  = await adapter.health()
    setExecutionProvider(adapter)
    response.status(200).json({ ok: true, url, health })
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Could not connect execution backend',
      code: 'EXECUTION_CONNECTION_FAILED',
    })
  }
})

providersRouter.get('/providers/execution/status', async (_request, response) => {
  const provider = getExecutionProvider()
  if (!provider) {
    response.status(200).json({ ok: false, message: 'No execution provider configured' })
    return
  }
  try {
    const health = await provider.health()
    response.status(200).json(health)
  } catch (error) {
    response.status(200).json({ ok: false, message: error instanceof Error ? error.message : 'Health check failed' })
  }
})

providersRouter.post('/providers/execution/disconnect', async (_request, response) => {
  const provider = getExecutionProvider()
  if (provider) {
    try { await provider.stopSession() } catch { /* best effort */ }
  }
  clearExecutionProvider()
  response.status(200).json({ ok: true })
})

providersRouter.post('/providers/execution/start', async (_request, response) => {
  const provider = getExecutionProvider()
  if (!provider) { response.status(400).json({ error: 'No execution provider configured', code: 'NOT_CONFIGURED' }); return }
  try {
    const session = await provider.startSession()
    response.status(200).json({ ok: true, session })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Start failed', code: 'START_FAILED' })
  }
})

providersRouter.post('/providers/execution/stop', async (_request, response) => {
  const provider = getExecutionProvider()
  if (!provider) { response.status(400).json({ error: 'No execution provider configured', code: 'NOT_CONFIGURED' }); return }
  try {
    await provider.stopSession()
    response.status(200).json({ ok: true })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Stop failed', code: 'STOP_FAILED' })
  }
})

// ── Reasoning provider ────────────────────────────────────────────────────────

providersRouter.post('/providers/reasoning/set', (request, response) => {
  const type = typeof request.body.type === 'string' ? request.body.type : 'chatgpt'
  if (type === 'manual') {
    setReasoningProvider(new ManualReasoningProvider())
    response.status(200).json({ ok: true, type: 'manual' })
    return
  }
  if (type === 'chatgpt') {
    const existing = getChatGPTAdapter()
    if (!existing) {
      response.status(400).json({ error: 'ChatGPT browser not connected. Call /providers/chatgpt/connect first.', code: 'NOT_CONNECTED' })
      return
    }
    setReasoningProvider(new ChatGPTReasoningProvider())
    response.status(200).json({ ok: true, type: 'chatgpt' })
    return
  }
  response.status(400).json({ error: `Unknown reasoning provider type: ${type}`, code: 'INVALID_INPUT' })
})

providersRouter.get('/providers/reasoning/status', async (_request, response) => {
  const provider = getReasoningProvider()
  if (!provider) { response.status(200).json({ ok: false, message: 'No reasoning provider configured' }); return }
  try {
    const health = await provider.healthCheck()
    response.status(200).json({ ...health, name: provider.name })
  } catch (error) {
    response.status(200).json({ ok: false, message: error instanceof Error ? error.message : 'Health check failed' })
  }
})