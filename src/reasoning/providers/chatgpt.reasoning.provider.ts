/**
 * src/reasoning/providers/chatgpt.reasoning.provider.ts
 *
 * Implements ReasoningProvider using the existing ChatGPTBrowserAdapter.
 * Sends a structured reasoning_request to the configured ChatGPT conversation,
 * waits for a reasoning_response, validates it, and returns it.
 *
 * This is NOT a new browser automation layer — it reuses ChatGPTBrowserAdapter
 * and simply wraps it with the reasoning protocol and Zod validation.
 *
 * The ChatGPT browser is isolated inside this provider.
 * Ollama sees none of this — it only calls the ask_reasoning_agent tool.
 */

import { nanoid } from 'nanoid'
import { ChatGPTBrowserAdapter } from '../../agents/chatgpt/browser.adapter.js'
import { getChatGPTAdapter }      from '../../agents/adapter.store.js'
import type {
  ReasoningProvider,
  ReasoningRequest,
  ReasoningResponse,
  ReasoningHealthStatus,
} from '../interfaces/reasoning.provider.js'
import { validateReasoningResponse } from '../schemas.js'

const RETRY_PROMPT = [
  'Your previous response was not valid JSON or did not match the required schema.',
  'Respond ONLY with a raw JSON object that satisfies this exact schema:',
  '',
  '{',
  '  "message_type": "reasoning_response",',
  '  "protocol_version": "1.0",',
  '  "session_id": "<echo from request>",',
  '  "task_id": "<echo from request>",',
  '  "sender": "agent_a",',
  '  "recipient": "agent_b",',
  '  "decision": { "type": "answer" },',
  '  "answer": { "value": "<your answer>", "confidence": 0.9 },',
  '  "reasoning_summary": "<short explanation>",',
  '  "recommended_action": { "type": "fill_field" }',
  '}',
].join('\n')

export class ChatGPTReasoningProvider implements ReasoningProvider {
  readonly name = 'chatgpt-reasoning'

  private getAdapter(): ChatGPTBrowserAdapter {
    const adapter = getChatGPTAdapter()
    if (!adapter) {
      throw new Error(
        'ChatGPTReasoningProvider: browser adapter not connected. ' +
        'Call POST /providers/chatgpt/connect first.'
      )
    }
    return adapter
  }

  async ask(request: ReasoningRequest): Promise<ReasoningResponse> {
    const adapter = this.getAdapter()
    const page    = (adapter as unknown as { page: import('playwright').Page | null }).page

    if (!page) {
      throw new Error('ChatGPTReasoningProvider: browser page not available.')
    }

    const startTime = Date.now()

    // ── Build the message text ─────────────────────────────────────────────
    const messageText = JSON.stringify(request, null, 2)

    // ── Send to ChatGPT ────────────────────────────────────────────────────
    const inputSelector   = '[data-testid="composer-background"] div[contenteditable="true"], #prompt-textarea'
    const sendBtnSelector = '[data-testid="send-button"], button[aria-label="Send message"]'

    await page.click(inputSelector)
    await page.fill(inputSelector, messageText)
    await page.click(sendBtnSelector)

    // ── Wait for response ──────────────────────────────────────────────────
    await this.waitForResponse(page)
    const rawText = await this.lastAssistantText(page)

    // ── Parse and validate ─────────────────────────────────────────────────
    let parsed: unknown
    try {
      parsed = JSON.parse(this.cleanResponse(rawText))
    } catch {
      // Retry once with explicit schema reminder
      await page.click(inputSelector)
      await page.fill(inputSelector, RETRY_PROMPT)
      await page.click(sendBtnSelector)
      await this.waitForResponse(page, 60_000)
      const retryText = await this.lastAssistantText(page)
      parsed = JSON.parse(this.cleanResponse(retryText))
    }

    const validation = validateReasoningResponse(parsed)
    if (!validation.valid) {
      throw new Error(
        `ChatGPTReasoningProvider: response failed schema validation: ${validation.errors.join(', ')}`
      )
    }

    console.log(
      `[Parallax][ChatGPTReasoning] Answer received in ${Date.now() - startTime}ms — ` +
      `confidence: ${validation.data.answer.confidence}`
    )

    return validation.data as ReasoningResponse
  }

  async healthCheck(): Promise<ReasoningHealthStatus> {
    const start = Date.now()
    try {
      const adapter = this.getAdapter()
      const status  = await adapter.healthCheck()
      return {
        ok:         status.ok,
        message:    status.message,
        latency_ms: Date.now() - start,
      }
    } catch (error) {
      return {
        ok:         false,
        message:    error instanceof Error ? error.message : 'Unknown error',
        latency_ms: Date.now() - start,
      }
    }
  }

  private async waitForResponse(page: import('playwright').Page, timeout = 120_000): Promise<void> {
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="stop-button"]'),
      { timeout }
    )
  }

  private async lastAssistantText(page: import('playwright').Page): Promise<string> {
    const text = await page.evaluate(() => {
      const messages = document.querySelectorAll('[data-message-author-role="assistant"]')
      return messages[messages.length - 1]?.textContent ?? ''
    })
    if (!text) throw new Error('ChatGPT response was empty')
    return text
  }

  private cleanResponse(text: string): string {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  }
}

// ─── Manual fallback ─────────────────────────────────────────────────────────

/**
 * ManualReasoningProvider — used when the ChatGPT browser is unavailable.
 * Prints the structured request to stdout, waits for the user to paste a response.
 */
export class ManualReasoningProvider implements ReasoningProvider {
  readonly name = 'manual-reasoning'

  async ask(request: ReasoningRequest): Promise<ReasoningResponse> {
    const { createInterface } = await import('node:readline')
    const startedAt = Date.now()

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[Parallax] MANUAL REASONING — Agent A Input Required')
      console.log(`Question: ${request.problem.question}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Copy this reasoning_request to ChatGPT:\n')
      console.log(JSON.stringify(request, null, 2))
      console.log('\nPaste reasoning_response below (END on its own line):')

      const raw  = await this.readInput()
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        console.log('[ManualReasoning] Invalid JSON, try again.')
        continue
      }

      const validation = validateReasoningResponse(parsed)
      if (validation.valid) {
        return validation.data as ReasoningResponse
      }
      console.log(`[ManualReasoning] Schema errors: ${validation.errors.join(', ')}`)
    }
    throw new Error('ManualReasoningProvider: failed validation after 3 attempts')
  }

  async healthCheck(): Promise<ReasoningHealthStatus> {
    return { ok: true, message: 'Manual reasoning provider always available' }
  }

  private async readInput(): Promise<string> {
    // Use dynamic import — this file is ESM, require() is not available
    const { createInterface } = await import('node:readline')
    return new Promise((resolve, reject) => {
      const rl = createInterface({ input: process.stdin, terminal: false })
      const lines: string[] = []
      rl.on('line', (line: string) => {
        if (line.trim() === 'END') { rl.close(); resolve(lines.join('\n')) }
        else lines.push(line)
      })
      rl.on('error', reject)
    })
  }
}
