import './db/migrate.js'
import { app } from './api/server.js'
import { config } from './config/config.js'
import { registerAllTools } from './tools/index.js'
import { NaukriAdapter } from './execution/adapters/naukri.adapter.js'
import { setExecutionProvider } from './execution/execution.store.js'
import { ManualReasoningProvider } from './reasoning/providers/chatgpt.reasoning.provider.js'
import { setReasoningProvider } from './reasoning/reasoning.store.js'

registerAllTools()

// ── Auto-connect ExecutionProvider on startup ─────────────────────────────────
// Connects to the naukri-autoapply execution API at EXECUTION_API_URL.
// If it's not running yet, this fails silently — you can connect later via
// POST /providers/execution/connect.
async function autoConnectProviders(): Promise<void> {
  if (config.executionApiUrl) {
    try {
      const adapter = new NaukriAdapter(config.executionApiUrl)
      const health  = await adapter.health()
      setExecutionProvider(adapter)
      console.log(`[Parallax] ExecutionProvider auto-connected: ${config.executionApiUrl} (${health.status})`)
    } catch {
      console.log(`[Parallax] ExecutionProvider not available at ${config.executionApiUrl} — connect manually via POST /providers/execution/connect`)
    }
  }

  // Default reasoning to ManualReasoningProvider until ChatGPT browser connects
  setReasoningProvider(new ManualReasoningProvider())
  console.log('[Parallax] ReasoningProvider set to ManualReasoningProvider (default). Connect ChatGPT via POST /providers/chatgpt/connect to upgrade.')
}

app.listen(config.port, async () => {
  console.log(`[Parallax] Server running on port ${config.port}`)
  await autoConnectProviders()
})
