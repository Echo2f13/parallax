/**
 * tests/integration/execution.e2e.test.ts
 *
 * End-to-end integration test for the Execution API chain:
 *
 *   Parallax (NaukriAdapter) → naukri-autoapply HTTP API → browser
 *
 * What this test verifies:
 *   1. naukri-autoapply execution server is reachable (health check)
 *   2. NaukriAdapter can call health() and get a valid response
 *   3. NaukriAdapter can call getPageState() and receive a structured PageState
 *   4. NaukriAdapter can call resolveAnswer() for a deterministic question
 *      and receive { answer, source } where source is 'profile' or 'cache'
 *
 * What this test does NOT do:
 *   - Launch a real browser (that requires naukri-autoapply to be running)
 *   - Call startSession() (that would launch Edge and navigate to Naukri)
 *   - Make real Ollama calls
 *
 * HOW TO RUN THE FULL E2E (manual steps):
 *   1. cd naukri-autoapply && npm run start:api   (starts on :4000)
 *   2. POST http://localhost:4000/execution/start  (launches browser)
 *   3. npx vitest run tests/integration/execution.e2e.test.ts
 *
 * For CI / automated run without a live browser, the tests mock the HTTP layer.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NaukriAdapter } from '../../src/execution/adapters/naukri.adapter.js'

// ── Mock fetch for offline/CI runs ────────────────────────────────────────────
// When EXECUTION_API_URL is set to a real running server, these mocks are
// bypassed (see the "live" describe block below).

const OFFLINE_MODE = process.env.EXECUTION_API_URL === undefined

// ─── Offline unit tests (always run) ─────────────────────────────────────────
describe('NaukriAdapter (offline / mocked)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  it('health() deserialises the response correctly', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      status: 'IDLE',
      session: {
        status: 'IDLE',
        startedAt: null,
        actionCount: 0,
        currentJob: null,
        qaCount: 0,
        recentActions: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter = new NaukriAdapter('http://localhost:4000')
    const health  = await adapter.health()

    expect(health.ok).toBe(true)
    expect(health.status).toBe('IDLE')
    expect(health.session.actionCount).toBe(0)
  })

  it('getPageState() returns a PageState with required fields', async () => {
    const mockPageState = {
      url:            'https://www.naukri.com/',
      title:          'Naukri.com',
      uiType:         'unknown',
      visibleText:    'Welcome to Naukri',
      actionButtons:  ['Login', 'Register'],
      pendingQuestion: null,
      timestamp:      new Date().toISOString(),
    }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      session: { status: 'BROWSING', startedAt: null, actionCount: 0, currentJob: null, qaCount: 0, recentActions: [] },
      pageState: mockPageState,
      resolution: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter   = new NaukriAdapter('http://localhost:4000')
    const pageState = await adapter.getPageState()

    expect(pageState.url).toBe('https://www.naukri.com/')
    expect(pageState.uiType).toBe('unknown')
    expect(Array.isArray(pageState.actionButtons)).toBe(true)
    expect(pageState.pendingQuestion).toBeNull()
  })

  it('resolveAnswer() returns profile source for personal facts', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      answer: 'Hyderabad',
      source: 'profile',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter    = new NaukriAdapter('http://localhost:4000')
    const resolution = await adapter.resolveAnswer('What is your current location?', [])

    expect(resolution.answer).toBe('Hyderabad')
    expect(resolution.source).toBe('profile')
  })

  it('resolveAnswer() returns null source when ChatGPT is needed', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      answer: null,
      source: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter    = new NaukriAdapter('http://localhost:4000')
    const resolution = await adapter.resolveAnswer('Why do you want to work at our company?', [])

    expect(resolution.answer).toBeNull()
    expect(resolution.source).toBeNull()
  })

  it('fillAnswer() forwards the answer to the execution backend', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      detail: 'Filled answer: "Hyderabad"',
      pageState: {
        url: 'https://www.naukri.com/apply', title: 'Apply', uiType: 'chatbot_overlay',
        visibleText: '', actionButtons: [], pendingQuestion: null, timestamp: new Date().toISOString(),
      },
      session: { status: 'QUESTIONING', startedAt: null, actionCount: 1, currentJob: null, qaCount: 1, recentActions: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter = new NaukriAdapter('http://localhost:4000')
    const result  = await adapter.fillAnswer('Current location?', [], 'Hyderabad', 'profile')

    expect(result.ok).toBe(true)
    expect(result.detail).toContain('Hyderabad')
  })

  it('advanceForm() returns the button text that was clicked', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      buttonText: 'Next',
      detail: 'Clicked: Next',
      pageState: {
        url: 'https://www.naukri.com/apply', title: 'Apply', uiType: 'classic_form',
        visibleText: '', actionButtons: ['Submit'], pendingQuestion: {
          question: 'Years of experience?',
          options: ['0-1', '1-3', '3-5'],
          uiType: 'classic_form',
        },
        timestamp: new Date().toISOString(),
      },
      session: { status: 'APPLYING', startedAt: null, actionCount: 2, currentJob: null, qaCount: 1, recentActions: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter = new NaukriAdapter('http://localhost:4000')
    const result  = await adapter.advanceForm()

    expect(result.ok).toBe(true)
    expect(result.buttonText).toBe('Next')
    expect(result.pageState?.pendingQuestion?.question).toBe('Years of experience?')
  })

  it('verifyApplication() returns success when indicator is found', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      success: true,
      indicator: 'applied_header_tag',
      pageState: {
        url: 'https://www.naukri.com/job-done', title: 'Applied', uiType: 'success',
        visibleText: 'Application sent', actionButtons: [], pendingQuestion: null,
        timestamp: new Date().toISOString(),
      },
      session: { status: 'DONE', startedAt: null, actionCount: 5, currentJob: null, qaCount: 3, recentActions: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const adapter = new NaukriAdapter('http://localhost:4000')
    const result  = await adapter.verifyApplication()

    expect(result.success).toBe(true)
    expect(result.indicator).toBe('applied_header_tag')
  })

  it('throws a descriptive error when the execution backend returns 4xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      error: 'No active session. Call POST /execution/start first.',
      code: 'NO_SESSION',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))

    const adapter = new NaukriAdapter('http://localhost:4000')
    await expect(adapter.getPageState()).rejects.toThrow('No active session')
  })
})

// ─── Live integration tests (only run when server is reachable) ───────────────
// Set EXECUTION_API_URL=http://localhost:4000 and have naukri-autoapply running.
describe.skipIf(OFFLINE_MODE)('NaukriAdapter — live server (requires running execution API)', () => {
  const adapter = new NaukriAdapter(process.env.EXECUTION_API_URL ?? 'http://localhost:4000')

  it('can reach the execution health endpoint', async () => {
    const health = await adapter.health()
    expect(health.ok).toBe(true)
    expect(['IDLE', 'STARTED', 'BROWSING', 'APPLYING', 'QUESTIONING', 'VERIFYING', 'DONE', 'FAILED'])
      .toContain(health.status)
  })

  it('can read the page state from the running browser', async () => {
    const pageState = await adapter.getPageState()
    expect(typeof pageState.url).toBe('string')
    expect(typeof pageState.uiType).toBe('string')
    expect(Array.isArray(pageState.actionButtons)).toBe(true)
    expect(typeof pageState.timestamp).toBe('string')
    console.log('[Live Test] Current page:', pageState.url, '| UI:', pageState.uiType)
  })

  it('can resolve a deterministic question without LLM', async () => {
    const result = await adapter.resolveAnswer('What is your current location?', [])
    // Should be answered from profile without any LLM call
    expect(result.source).toBe('profile')
    expect(typeof result.answer).toBe('string')
    console.log('[Live Test] Resolved location:', result.answer, '| source:', result.source)
  })

  it('can perform one verified action: fill + advance', async () => {
    // This test only runs if there is an active pending question on the page.
    const pageState = await adapter.getPageState()
    if (!pageState.pendingQuestion) {
      console.log('[Live Test] No pending question on current page — skipping fill+advance.')
      return
    }

    const { question, options } = pageState.pendingQuestion
    console.log('[Live Test] Pending question:', question, '| options:', options)

    // First try to resolve deterministically
    const resolution = await adapter.resolveAnswer(question, options)
    if (!resolution.answer) {
      console.log('[Live Test] No deterministic answer — would need ChatGPT. Skipping fill.')
      return
    }

    console.log('[Live Test] Filling answer:', resolution.answer, '| source:', resolution.source)
    const fillResult = await adapter.fillAnswer(question, options, resolution.answer, resolution.source ?? 'unknown')
    expect(fillResult.ok).toBe(true)

    const advResult = await adapter.advanceForm()
    expect(advResult.ok).toBe(true)
    console.log('[Live Test] Advanced form. Button:', advResult.buttonText)

    const verify = await adapter.verifyApplication()
    console.log('[Live Test] Verify result — success:', verify.success, '| indicator:', verify.indicator)
    // We don't assert success here because we may just be on an intermediate step
    expect(typeof verify.success).toBe('boolean')
  })
})
