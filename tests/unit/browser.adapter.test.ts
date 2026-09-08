import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserMock = vi.hoisted(() => ({
  page: {
    goto: vi.fn(), waitForSelector: vi.fn(), click: vi.fn(), fill: vi.fn(), waitForFunction: vi.fn(), evaluate: vi.fn(), $: vi.fn(), url: vi.fn(),
  },
  context: { newPage: vi.fn(), close: vi.fn() },
  chromium: { launchPersistentContext: vi.fn() },
}))

vi.mock('playwright', () => ({ chromium: browserMock.chromium }))

import { ChatGPTBrowserAdapter } from '../../src/agents/chatgpt/browser.adapter.js'

const validResult = JSON.stringify({
  message_type: 'investigation_result', protocol_version: '1.0', session_id: 'session', task_id: 'task', sender: 'agent_b', recipient: 'orchestrator', status: 'completed',
  observations: [], evidence: [], experiments: [], conclusions: [], remaining_unknowns: [], recommended_next_action: 'CONCLUDE', agent_assessment: 'neutral',
})

describe('ChatGPTBrowserAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserMock.context.newPage.mockResolvedValue(browserMock.page)
    browserMock.chromium.launchPersistentContext.mockResolvedValue(browserMock.context)
    browserMock.page.goto.mockResolvedValue(undefined)
    browserMock.page.waitForSelector.mockResolvedValue(undefined)
    browserMock.page.waitForFunction.mockResolvedValue(undefined)
    browserMock.page.$.mockResolvedValue({})
    browserMock.page.url.mockReturnValue('https://chatgpt.com/c/test123')
    browserMock.page.evaluate.mockResolvedValue(validResult)
  })

  it('reports disconnected health', async () => {
    await expect(new ChatGPTBrowserAdapter('test123', 'profile', 'Default').healthCheck()).resolves.toMatchObject({ ok: false, message: 'Browser not connected' })
  })

  it('connects to the configured conversation URL', async () => {
    await new ChatGPTBrowserAdapter('test123', 'profile', 'Default').connect()
    expect(browserMock.page.goto).toHaveBeenCalledWith('https://chatgpt.com/c/test123', expect.objectContaining({ waitUntil: 'domcontentloaded' }))
  })

  it('reports healthy when ChatGPT input is available', async () => {
    const adapter = new ChatGPTBrowserAdapter('test123', 'profile', 'Default')
    await adapter.connect()
    await expect(adapter.healthCheck()).resolves.toMatchObject({ ok: true })
  })

  it('strips markdown-wrapped JSON responses', async () => {
    browserMock.page.evaluate.mockResolvedValueOnce(`\`\`\`json\n${validResult}\n\`\`\``)
    const adapter = new ChatGPTBrowserAdapter('test123', 'profile', 'Default')
    await adapter.connect()
    await expect(adapter.send({ sessionId: 'session', request: {} as never })).resolves.toMatchObject({ model: 'chatgpt-browser' })
  })

  it('retries when the first response is not JSON', async () => {
    browserMock.page.evaluate.mockResolvedValueOnce('not json').mockResolvedValueOnce(validResult)
    const adapter = new ChatGPTBrowserAdapter('test123', 'profile', 'Default')
    await adapter.connect()
    await expect(adapter.send({ sessionId: 'session', request: {} as never })).resolves.toBeTruthy()
    expect(browserMock.page.fill).toHaveBeenCalledTimes(2)
  })
})