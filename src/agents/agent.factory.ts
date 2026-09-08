import { OllamaAdapter } from './ollama/ollama.adapter.js'
import { ManualRelayAdapter } from './chatgpt/manual.adapter.js'
import { OpenAIAdapter } from './chatgpt/openai.adapter.js'
import type { AgentProvider } from './interfaces/agent.provider.js'
import { ChatGPTBrowserAdapter } from './chatgpt/browser.adapter.js'
import { getChatGPTAdapter } from './adapter.store.js'
import { config } from '../config/config.js'

export function createAgentAProvider(providerName: string): AgentProvider {
  switch (providerName) {
    case 'manual': return new ManualRelayAdapter()
    case 'browser': return getChatGPTAdapter() ?? new ChatGPTBrowserAdapter(config.chatgptConversationId, config.chromeUserDataDir, config.chromeProfile, config.browserChannel)
    case 'openai': return new OpenAIAdapter()
    default: throw new Error(`Unknown Agent A provider: ${providerName}`)
  }
}

export function createAgentBProvider(model: string): AgentProvider {
  return new OllamaAdapter(model)
}