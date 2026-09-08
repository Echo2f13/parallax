import type { BrowserContext, Page } from 'playwright'
import { validateAgentResponse } from '../../protocol/validator.js'
import type { AgentProvider, AgentRequest, AgentResponse, HealthStatus } from '../interfaces/agent.provider.js'

export class ChatGPTBrowserAdapter implements AgentProvider {
  readonly name = 'browser'
  private browser: BrowserContext | null = null
  private page: Page | null = null

  constructor(private readonly conversationId: string, private readonly userDataDir: string, private readonly profile: string, private readonly channel: string = 'chrome') {}

  async connect(): Promise<void> {
    const { chromium } = await import('playwright')
    console.log(`[ChatGPTBrowserAdapter] Launching browser (channel: ${this.channel}, profile: ${this.profile})...`)
    this.browser = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      channel: this.channel,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--profile-directory=${this.profile}`,
        '--start-maximized',
      ],
    })
    const pages = this.browser.pages ? this.browser.pages() : []
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage()
    if (this.page.bringToFront) {
      try { await this.page.bringToFront() } catch { /* best effort */ }
    }
    const targetUrl = this.conversationId ? `https://chatgpt.com/c/${this.conversationId}` : 'https://chatgpt.com/'
    console.log(`[ChatGPTBrowserAdapter] Navigating to ${targetUrl}...`)
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const selector = '[data-testid="composer-background"], #prompt-textarea, textarea, div[contenteditable="true"]'
    try {
      await this.page.waitForSelector(selector, { timeout: 8000 })
      console.log('[ChatGPTBrowserAdapter] ChatGPT composer ready.')
    } catch {
      console.log(`[ChatGPTBrowserAdapter] Composer not found immediately. Current URL: ${this.page.url()}`)
      console.log('[ChatGPTBrowserAdapter] If login is required, please log in now. Waiting up to 300s...')
      try {
        await this.page.waitForSelector(selector, { timeout: 300000 })
        console.log('[ChatGPTBrowserAdapter] ChatGPT composer detected.')
        if (this.conversationId && !this.page.url().includes(this.conversationId)) {
          console.log(`[ChatGPTBrowserAdapter] Redirecting to target conversation https://chatgpt.com/c/${this.conversationId}...`)
          await this.page.goto(`https://chatgpt.com/c/${this.conversationId}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await this.page.waitForSelector(selector, { timeout: 15000 })
        }
      } catch {
        throw new Error('ChatGPT chat input not found — is the conversation ID correct and are you logged in?')
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.browser?.close()
    this.browser = null
    this.page = null
  }

  async send(request: AgentRequest): Promise<AgentResponse> {
    if (!this.page) throw new Error('Browser not connected. Call connect() first.')
    const startTime = Date.now()
    const inputSelector = '[data-testid="composer-background"] div[contenteditable="true"], #prompt-textarea, div[contenteditable="true"], textarea'
    const sendButtonSelector = '[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"]'
    await this.page.click(inputSelector)
    await this.page.fill(inputSelector, JSON.stringify(request.request, null, 2))
    await this.page.click(sendButtonSelector)
    await this.waitForResponse()
    const responseText = await this.lastAssistantText()
    let parsed: unknown
    try {
      parsed = JSON.parse(this.cleanResponse(responseText)) as unknown
    } catch {
      await this.page.click(inputSelector)
      await this.page.fill(inputSelector, 'Your previous response was not valid JSON. Respond ONLY with a raw JSON object. No markdown. No explanation.')
      await this.page.click(sendButtonSelector)
      await this.waitForResponse(60000)
      parsed = JSON.parse(this.cleanResponse(await this.lastAssistantText())) as unknown
    }
    const validation = validateAgentResponse(parsed)
    if (!validation.valid) throw new Error(`ChatGPT response failed schema validation: ${validation.errors.join(', ')}`)
    return { result: validation.data, rawResponse: responseText, model: 'chatgpt-browser', durationMs: Date.now() - startTime }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.page) return { ok: false, message: 'Browser not connected' }
      const url = this.page.url()
      if (!url.includes('chatgpt.com')) return { ok: false, message: `Browser is on wrong page: ${url}` }
      const inputExists = await this.page.$('[data-testid="composer-background"], #prompt-textarea, textarea, div[contenteditable="true"]')
      return inputExists ? { ok: true, message: 'Browser adapter connected and ready' } : { ok: false, message: 'ChatGPT input not found — UI may have changed' }
    } catch (error) {
      return { ok: false, message: `healthCheck error: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  private async waitForResponse(timeout = 120000): Promise<void> {
    if (!this.page) throw new Error('Browser page is unavailable')
    await this.page.waitForFunction(() => !document.querySelector('[data-testid="stop-button"]'), { timeout })
  }

  private async lastAssistantText(): Promise<string> {
    if (!this.page) throw new Error('Browser page is unavailable')
    const responseText = await this.page.evaluate(() => {
      const messages = document.querySelectorAll('[data-message-author-role="assistant"]')
      return messages[messages.length - 1]?.textContent ?? ''
    })
    if (!responseText) throw new Error('ChatGPT response was empty')
    return responseText
  }

  private cleanResponse(responseText: string): string {
    return responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  }
}
