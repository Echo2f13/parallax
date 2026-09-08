/**
 * src/reasoning/reasoning.store.ts
 *
 * Singleton store for the active ReasoningProvider.
 */

import type { ReasoningProvider } from './interfaces/reasoning.provider.js'

let _provider: ReasoningProvider | null = null

export function setReasoningProvider(provider: ReasoningProvider): void {
  _provider = provider
}

export function getReasoningProvider(): ReasoningProvider | null {
  return _provider
}

export function clearReasoningProvider(): void {
  _provider = null
}
