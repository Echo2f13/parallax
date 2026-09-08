/**
 * src/execution/interfaces/execution.provider.ts
 *
 * Generic ExecutionProvider interface.
 * No Naukri-specific coupling — this is the contract any job-application
 * automation backend must implement to be usable by Parallax.
 *
 * The Orchestrator and Ollama tool layer talk to this interface only.
 * The concrete adapter (NaukriAdapter) is responsible for translating
 * these calls into the naukri-autoapply HTTP API.
 */

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface Job {
  jobUrl: string
  role: string
  company: string
  location: string
  experience: string
  postedAge?: string
  isAppliedOnPage?: boolean
}

export interface JobSearchOptions {
  mode: 'recommended' | 'search'
  keyword?: string
  location?: string
  experienceLevels?: number[]
  maxPages?: number
  maxAgeDays?: number | null
}

/** Describes what the browser is currently showing. */
export interface PageState {
  url: string
  title: string
  /** Coarse UI classification: chatbot_overlay | classic_form | workday_form | job_listing | job_list | success | error | unknown */
  uiType: string
  /** First 2000 chars of visible body text */
  visibleText: string
  /** Visible action button labels */
  actionButtons: string[]
  /** Active question waiting for an answer, if any */
  pendingQuestion: PendingQuestion | null
  timestamp: string
}

export interface PendingQuestion {
  question: string
  options: string[]
  uiType: string
}

export interface ApplyResult {
  ok: boolean
  status: 'APPLYING' | 'ALREADY_APPLIED' | string
  applyClicked?: boolean
  pageState?: PageState
  message?: string
}

export interface AnswerResult {
  ok: boolean
  detail: string
  pageState?: PageState
}

export interface AdvanceResult {
  ok: boolean
  buttonText: string | null
  detail: string
  pageState?: PageState
}

export interface VerifyResult {
  ok: boolean
  success: boolean
  indicator: string | null
  pageState?: PageState
}

/**
 * Rich detail about a single job listing page.
 * Returned by readJobDetail() — used by Ollama to rank jobs before applying.
 */
export interface JobDetail {
  ok: boolean
  jobUrl: string
  title: string
  company: string
  location: string
  experience: string
  /** Listed skills/technologies from the page */
  skills: string[]
  /** Full job description text (up to 3000 chars) */
  description: string
  /** 'naukri' = chatbot apply, 'external' = redirects elsewhere, 'unknown' */
  applyType: 'naukri' | 'external' | 'unknown'
}

/**
 * Resolution of a question by the local answer engine.
 * source === null means the question requires external reasoning (ChatGPT).
 */
export interface AnswerResolution {
  answer: string | null
  source: 'profile' | 'cache' | 'llm' | null
}

export interface SessionSnapshot {
  status: string
  startedAt: string | null
  actionCount: number
  currentJob: Job | null
  qaCount: number
  recentActions: Array<{ url: string; actionKey: string }>
}

export interface ExecutionHealthStatus {
  ok: boolean
  status: string
  session: SessionSnapshot
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface ExecutionProvider {
  readonly name: string

  /** Health-check — returns current session status. */
  health(): Promise<ExecutionHealthStatus>

  /** Launch the browser and ensure login. Must be called before any other method. */
  startSession(): Promise<SessionSnapshot>

  /**
   * Retrieve a list of jobs from the execution backend.
   * The backend navigates and scrapes; Parallax only receives structured data.
   */
  getJobs(options: JobSearchOptions): Promise<Job[]>

  /**
   * Navigate to the job URL and click Apply.
   * Does NOT run the full application loop — leaves the page for step-by-step control.
   */
  beginApply(job: Job): Promise<ApplyResult>

  /** Read the current page state without modifying anything. */
  getPageState(): Promise<PageState>

  /**
   * Ask the local answer engine to resolve a question deterministically.
   * Returns { answer: null, source: null } when ChatGPT is needed.
   */
  resolveAnswer(question: string, options: string[], source?: string): Promise<AnswerResolution>

  /**
   * Fill a known answer into the currently visible form field.
   * The caller decides the answer; this method only interacts with the DOM.
   */
  fillAnswer(question: string, options: string[], answer: string, source?: string): Promise<AnswerResult>

  /** Click Next / Submit / Send to advance to the next form step. */
  advanceForm(): Promise<AdvanceResult>

  /** Check whether the current application was completed successfully. */
  verifyApplication(): Promise<VerifyResult>

  /**
   * Read the full job description from a job listing page without navigating
   * the main browser page. Uses a side tab internally.
   * Used by Ollama to rank/evaluate a job before deciding to apply.
   */
  readJobDetail(jobUrl: string): Promise<JobDetail>

  /** Close the browser and clean up the session. */
  stopSession(): Promise<void>
}
