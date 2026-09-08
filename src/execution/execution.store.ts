/**
 * src/execution/execution.store.ts
 *
 * Singleton store for the active ExecutionProvider instance.
 * Mirrors the pattern used by adapter.store.ts for the ChatGPT adapter.
 */

import type { ExecutionProvider } from './interfaces/execution.provider.js'

let _provider: ExecutionProvider | null = null

export function setExecutionProvider(provider: ExecutionProvider): void {
  _provider = provider
}

export function getExecutionProvider(): ExecutionProvider | null {
  return _provider
}

export function clearExecutionProvider(): void {
  _provider = null
}
