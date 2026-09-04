import * as dotenv from 'dotenv'

dotenv.config()

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  ollamaBaseUrl: optionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  ollamaDefaultModel: optionalEnv('OLLAMA_DEFAULT_MODEL', 'qwen2.5:7b'),
  dbPath: optionalEnv('DB_PATH', './data/parallax.db'),
  workspacePath: optionalEnv('WORKSPACE_PATH', './workspace'),
  maxIterations: parseInt(optionalEnv('MAX_ITERATIONS', '8'), 10),
  maxRuntimeSeconds: parseInt(optionalEnv('MAX_RUNTIME_SECONDS', '1800'), 10),
  maxAgentMessages: parseInt(optionalEnv('MAX_AGENT_MESSAGES', '100'), 10),
  chromeUserDataDir: optionalEnv('CHROME_USER_DATA_DIR', ''),
  chromeProfile: optionalEnv('CHROME_PROFILE', 'Default'),
  chatgptConversationId: optionalEnv('CHATGPT_CONVERSATION_ID', ''),
  shellCommandAllowlist: [
    'npm', 'npx', 'node', 'git', 'tsc', 'tsx',
    'python', 'python3', 'pip', 'pip3',
    'cat', 'ls', 'dir', 'echo', 'type',
    'grep', 'find', 'rg',
  ],
} as const

export type Config = typeof config