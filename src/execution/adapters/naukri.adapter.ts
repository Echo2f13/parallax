/**
 * src/execution/adapters/naukri.adapter.ts
 *
 * HTTP adapter that wraps the naukri-autoapply Execution API.
 * Implements the generic ExecutionProvider interface — the orchestrator
 * and tool layer never import this class directly; they use the interface.
 *
 * All browser interaction, Playwright, question-handling, and AI answer logic
 * lives in the naukri-autoapply process.  This file is ONLY an HTTP client.
 */

import type {
  ExecutionProvider,
  ExecutionHealthStatus,
  SessionSnapshot,
  Job,
  JobDetail,
  JobSearchOptions,
  ApplyResult,
  PageState,
  AnswerResolution,
  AnswerResult,
  AdvanceResult,
  VerifyResult,
} from '../interfaces/execution.provider.js'

const DEFAULT_BASE_URL = 'http://localhost:4000'
const DEFAULT_TIMEOUT_MS = 120_000  // generous — browser ops can be slow

export class NaukriAdapter implements ExecutionProvider {
  readonly name = 'naukri'

  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(baseUrl: string = DEFAULT_BASE_URL, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.timeoutMs = timeoutMs
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
      // Guard against HTML error pages (e.g. 404 from Express before the route is registered)
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        throw new Error(
          `NaukriAdapter GET ${path} → ${res.status}: non-JSON response (${contentType}): ${text.slice(0, 120)}`
        )
      }
      const body = await res.json() as Record<string, unknown>
      if (!res.ok) {
        throw new Error(
          `NaukriAdapter GET ${path} → ${res.status}: ${(body['error'] as string) ?? 'Unknown error'}`
        )
      }
      return body as T
    } finally {
      clearTimeout(timer)
    }
  }

  private async post<T>(path: string, payload?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      })
      const body = await res.json() as Record<string, unknown>
      if (!res.ok) {
        throw new Error(
          `NaukriAdapter POST ${path} → ${res.status}: ${(body['error'] as string) ?? 'Unknown error'}`
        )
      }
      return body as T
    } finally {
      clearTimeout(timer)
    }
  }

  // ─── ExecutionProvider implementation ─────────────────────────────────────

  async health(): Promise<ExecutionHealthStatus> {
    return this.get<ExecutionHealthStatus>('/execution/health')
  }

  async startSession(): Promise<SessionSnapshot> {
    const res = await this.post<{ ok: boolean; session: SessionSnapshot }>('/execution/start')
    return res.session
  }

  async getJobs(options: JobSearchOptions): Promise<Job[]> {
    const params = new URLSearchParams()
    params.set('mode', options.mode)
    if (options.keyword)  params.set('keyword',  options.keyword)
    if (options.location) params.set('location', options.location)
    if (options.experienceLevels) params.set('exp', options.experienceLevels.join(','))
    if (options.maxPages) params.set('maxPages', String(options.maxPages))
    if (options.maxAgeDays != null) params.set('maxAgeDays', String(options.maxAgeDays))

    const res = await this.get<{ ok: boolean; count: number; jobs: Job[] }>(
      `/execution/jobs?${params.toString()}`
    )
    return res.jobs
  }

  async beginApply(job: Job): Promise<ApplyResult> {
    return this.post<ApplyResult>('/execution/apply', job)
  }

  async getPageState(): Promise<PageState> {
    const res = await this.get<{ ok: boolean; pageState: PageState }>('/execution/state')
    return res.pageState
  }

  async resolveAnswer(question: string, options: string[], source = 'naukri'): Promise<AnswerResolution> {
    const res = await this.post<{ ok: boolean; answer: string | null; source: AnswerResolution['source'] }>(
      '/execution/resolve',
      { question, options, source }
    )
    return { answer: res.answer, source: res.source }
  }

  async fillAnswer(
    question: string,
    options: string[],
    answer: string,
    source?: string,
  ): Promise<AnswerResult> {
    return this.post<AnswerResult>('/execution/answer', { question, options, answer, source })
  }

  async advanceForm(): Promise<AdvanceResult> {
    return this.post<AdvanceResult>('/execution/advance')
  }

  async verifyApplication(): Promise<VerifyResult> {
    return this.get<VerifyResult>('/execution/verify')
  }

  async readJobDetail(jobUrl: string): Promise<JobDetail> {
    return this.get<JobDetail>(
      `/execution/job-detail?url=${encodeURIComponent(jobUrl)}`
    )
  }

  async stopSession(): Promise<void> {
    await this.post('/execution/stop')
  }
}
