/**
 * src/tools/execution/execution.tools.ts
 *
 * Registers execution tools into the ToolRegistry.
 * These are the tools Ollama calls to control the automation backend.
 *
 * Generic naming — no Naukri-specific coupling in tool names.
 * The adapter behind these tools is resolved from execution.store at call time.
 *
 * Tools registered:
 *   get_page_state          — observe what the browser currently shows
 *   inspect_jobs            — retrieve available jobs
 *   apply_to_job            — navigate to a job and click Apply
 *   resolve_answer          — ask local engine for deterministic answer
 *   fill_answer             — fill a known answer into current field
 *   advance_form            — click Next / Submit / Send
 *   verify_application      — check whether application succeeded
 */

import type { ToolRegistry, ToolContext, ToolResult } from '../registry/tool.registry.js'
import { getExecutionProvider } from '../../execution/execution.store.js'
import type { ExecutionProvider } from '../../execution/interfaces/execution.provider.js'

function requireProvider(): ExecutionProvider {
  const provider = getExecutionProvider()
  if (!provider) throw new Error('No ExecutionProvider configured. Start the execution backend first.')
  return provider
}

export function registerExecutionTools(registry: ToolRegistry): void {

  // ── get_page_state ────────────────────────────────────────────────────────
  registry.register({
    name: 'get_page_state',
    description:
      'Returns a snapshot of what the browser is currently showing: URL, title, ' +
      'visible text, UI type (chatbot_overlay | classic_form | workday_form | job_listing | success | error | unknown), ' +
      'available action buttons, and any pending question waiting for an answer. ' +
      'Call this to OBSERVE the current state before deciding on the next action.',
    permission_level: 'READ_ONLY',
    timeout_ms: 30_000,
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const pageState = await provider.getPageState()
      return { success: true, output: pageState }
    },
  })

  // ── inspect_jobs ──────────────────────────────────────────────────────────
  registry.register({
    name: 'inspect_jobs',
    description:
      'Retrieves a list of available job listings from the automation backend. ' +
      'mode: "recommended" returns Naukri\'s recommended jobs; ' +
      '"search" searches by keyword + location. ' +
      'Returns an array of Job objects with jobUrl, role, company, location, experience.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 120_000,
    input_schema: {
      type: 'object',
      properties: {
        mode:             { type: 'string', description: '"recommended" or "search"' },
        keyword:          { type: 'string', description: 'Search keyword (search mode only)' },
        location:         { type: 'string', description: 'Location filter (search mode only)' },
        experience_levels:{ type: 'string', description: 'Comma-separated experience levels, e.g. "0,1"' },
        max_pages:        { type: 'string', description: 'Max pages to scrape (default 2)' },
        max_age_days:     { type: 'string', description: 'Only return jobs posted within N days' },
      },
      required: ['mode'],
    },
    handler: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const mode  = String(params['mode'] ?? 'recommended') as 'recommended' | 'search'
      const expLevels = params['experience_levels']
        ? String(params['experience_levels']).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        : [0, 1]
      const jobs = await provider.getJobs({
        mode,
        keyword:          params['keyword']      ? String(params['keyword'])      : undefined,
        location:         params['location']     ? String(params['location'])     : undefined,
        experienceLevels: expLevels,
        maxPages:         params['max_pages']    ? parseInt(String(params['max_pages']), 10) : 2,
        maxAgeDays:       params['max_age_days'] ? parseInt(String(params['max_age_days']), 10) : null,
      })
      return { success: true, output: { count: jobs.length, jobs } }
    },
  })

  // ── apply_to_job ──────────────────────────────────────────────────────────
  registry.register({
    name: 'apply_to_job',
    description:
      'Navigates the browser to a job listing and clicks the Apply button. ' +
      'Does NOT complete the full application — leaves the form open for step-by-step control. ' +
      'Returns the page state after clicking Apply, including any pending question.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 90_000,
    input_schema: {
      type: 'object',
      properties: {
        job_url:    { type: 'string', description: 'Full job listing URL' },
        role:       { type: 'string', description: 'Job role title' },
        company:    { type: 'string', description: 'Company name' },
        location:   { type: 'string', description: 'Job location' },
        experience: { type: 'string', description: 'Experience requirement string' },
      },
      required: ['job_url'],
    },
    handler: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const result = await provider.beginApply({
        jobUrl:     String(params['job_url'] ?? ''),
        role:       String(params['role']       ?? 'Unknown'),
        company:    String(params['company']    ?? 'Unknown'),
        location:   String(params['location']   ?? ''),
        experience: String(params['experience'] ?? ''),
      })
      return { success: result.ok, output: result }
    },
  })

  // ── resolve_answer ─────────────────────────────────────────────────────────
  registry.register({
    name: 'resolve_answer',
    description:
      'Asks the local answer engine to resolve a question without calling any LLM. ' +
      'Returns { answer, source } where source is "profile", "cache", or null. ' +
      'If answer is null, the question requires external reasoning — call ask_reasoning_agent instead.',
    permission_level: 'READ_ONLY',
    timeout_ms: 30_000,
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question text' },
        options:  { type: 'string', description: 'Comma-separated available options (if any)' },
        source:   { type: 'string', description: '"naukri" or "workday"' },
      },
      required: ['question'],
    },
    handler: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const options = params['options']
        ? String(params['options']).split(',').map(s => s.trim()).filter(Boolean)
        : []
      const result = await provider.resolveAnswer(
        String(params['question'] ?? ''),
        options,
        String(params['source'] ?? 'naukri'),
      )
      return { success: true, output: result }
    },
  })

  // ── fill_answer ───────────────────────────────────────────────────────────
  registry.register({
    name: 'fill_answer',
    description:
      'Fills a specific answer into the currently visible form field. ' +
      'You must have already resolved or decided the answer. ' +
      'Returns ok and a detail string. After filling, call advance_form or get_page_state.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 30_000,
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question text (for logging)' },
        options:  { type: 'string', description: 'Comma-separated options (if applicable)' },
        answer:   { type: 'string', description: 'The answer to fill in' },
        source:   { type: 'string', description: 'Answer source for audit: profile | cache | llm | chatgpt' },
      },
      required: ['answer'],
    },
    handler: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const options = params['options']
        ? String(params['options']).split(',').map(s => s.trim()).filter(Boolean)
        : []
      const result = await provider.fillAnswer(
        String(params['question'] ?? ''),
        options,
        String(params['answer'] ?? ''),
        params['source'] ? String(params['source']) : undefined,
      )
      return { success: result.ok, output: result }
    },
  })

  // ── advance_form ──────────────────────────────────────────────────────────
  registry.register({
    name: 'advance_form',
    description:
      'Clicks the primary action button (Next, Submit, Send, Apply Now, Save) ' +
      'to advance to the next form step or submit the application. ' +
      'Always call get_page_state after this to observe what changed.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 30_000,
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const result = await provider.advanceForm()
      return { success: result.ok, output: result }
    },
  })

  // ── read_job_detail ───────────────────────────────────────────────────────
  registry.register({
    name: 'read_job_detail',
    description:
      'Reads the full job description from a Naukri job listing page (title, company, ' +
      'location, experience, required skills, job description text, and apply type). ' +
      'Uses a side tab — the main browser page is never navigated away. ' +
      'Call this after inspect_jobs to evaluate a job before applying. ' +
      'Returns { title, company, location, experience, skills, description, applyType }. ' +
      'applyType "naukri" = direct chatbot apply. "external" = redirects to another site (skip it).',
    permission_level: 'READ_ONLY',
    timeout_ms: 45_000,
    input_schema: {
      type: 'object',
      properties: {
        job_url: { type: 'string', description: 'Full Naukri job listing URL' },
      },
      required: ['job_url'],
    },
    handler: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const detail = await provider.readJobDetail(String(params['job_url'] ?? ''))
      return { success: detail.ok, output: detail }
    },
  })

  // ── verify_application ────────────────────────────────────────────────────
  registry.register({
    name: 'verify_application',
    description:
      'Checks whether the current application was completed successfully. ' +
      'Returns { success: true | false, indicator }. ' +
      'Call this after the final Submit / Apply Now click.',
    permission_level: 'READ_ONLY',
    timeout_ms: 30_000,
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const provider = requireProvider()
      const result = await provider.verifyApplication()
      return { success: true, output: result }
    },
  })

  console.log('[Parallax][Tools] Execution tools registered: get_page_state, inspect_jobs, read_job_detail, apply_to_job, resolve_answer, fill_answer, advance_form, verify_application')
}
