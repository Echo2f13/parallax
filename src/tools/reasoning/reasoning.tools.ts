/**
 * src/tools/reasoning/reasoning.tools.ts
 *
 * Registers the ask_reasoning_agent tool.
 *
 * This is the ONLY tool Ollama uses to contact ChatGPT.
 * Ollama never knows it's talking to ChatGPT — it just calls ask_reasoning_agent.
 * Parallax routes the call to the configured ReasoningProvider.
 *
 * Registered tools:
 *   ask_reasoning_agent  — ask the configured reasoning provider for help
 */

import { nanoid } from 'nanoid'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { ToolRegistry, ToolContext, ToolResult } from '../registry/tool.registry.js'
import { getReasoningProvider } from '../../reasoning/reasoning.store.js'
import type { ReasoningRequest } from '../../reasoning/interfaces/reasoning.provider.js'

// ── Load candidate profile once at startup ────────────────────────────────────
interface ProfileShape {
  fullName?: string
  experience?: number
  currentLocation?: string
  skills?: string[]
  jobRoles?: string[]
  summary?: string
  currentCompany?: string
  currentJobTitle?: string
  noticePeriod?: string
  expectedCTC?: string
}

const CANDIDATE_PROFILE_FOR_CHATGPT: ProfileShape = (() => {
  const paths = [
    resolve(process.cwd(), '../../../others/rohanth/autoapply/naukri-autoapply/config/profile.json'),
    resolve(process.cwd(), 'config/profile.json'),
  ]
  for (const p of paths) {
    try { return JSON.parse(readFileSync(p, 'utf8')) as ProfileShape } catch { /* try next */ }
  }
  return {}
})()

function buildProfileSummary(extra: string): string {
  const p = CANDIDATE_PROFILE_FOR_CHATGPT
  const lines: string[] = []
  if (p.fullName)       lines.push(`Name: ${p.fullName}`)
  if (p.currentJobTitle && p.currentCompany)
                        lines.push(`Current role: ${p.currentJobTitle} at ${p.currentCompany}`)
  if (p.experience != null) lines.push(`Total experience: ${p.experience} years`)
  if (p.currentLocation) lines.push(`Location: ${p.currentLocation}`)
  if (p.noticePeriod)   lines.push(`Notice period: ${p.noticePeriod}`)
  if (p.expectedCTC)    lines.push(`Expected CTC: ${p.expectedCTC}`)
  if (p.jobRoles?.length)  lines.push(`Target roles: ${p.jobRoles.join(', ')}`)
  if (p.skills?.length)    lines.push(`Skills: ${p.skills.slice(0, 20).join(', ')}`)
  if (p.summary)        lines.push(`Summary: ${p.summary}`)
  if (extra)            lines.push(`Additional context: ${extra}`)
  return lines.join('\n')
}

export function registerReasoningTools(registry: ToolRegistry): void {

  registry.register({
    name: 'ask_reasoning_agent',
    description:
      'Asks the reasoning agent (ChatGPT) for help with a question that requires ' +
      'higher-level judgement: ambiguous application questions, career-specific answers, ' +
      'company-specific research, or any question that profile/cache/local-LLM cannot answer. ' +
      'Do NOT call this for deterministic fields (name, email, years of experience, yes/no skills). ' +
      'Always try resolve_answer first. ' +
      'Returns { answer, confidence, reasoning_summary }.',
    permission_level: 'SAFE_EXECUTION',
    timeout_ms: 180_000, // ChatGPT can be slow
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The application question that needs reasoning',
        },
        options: {
          type: 'string',
          description: 'Comma-separated available options (leave empty for free-text questions)',
        },
        company: {
          type: 'string',
          description: 'Company the candidate is applying to',
        },
        role: {
          type: 'string',
          description: 'Job role being applied for',
        },
        context_notes: {
          type: 'string',
          description: 'Any additional context about the application form or page',
        },
        session_id: {
          type: 'string',
          description: 'Current Parallax session ID for traceability',
        },
        task_id: {
          type: 'string',
          description: 'Current task ID for traceability',
        },
      },
      required: ['question'],
    },
    handler: async (params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const provider = getReasoningProvider()
      if (!provider) {
        throw new Error(
          'No ReasoningProvider configured. ' +
          'Connect ChatGPT via POST /providers/chatgpt/connect first.'
        )
      }

      const options = params['options']
        ? String(params['options']).split(',').map(s => s.trim()).filter(Boolean)
        : []

      const request: ReasoningRequest = {
        message_type:     'reasoning_request',
        protocol_version: '1.0',
        session_id:       String(params['session_id'] ?? ctx.sessionId ?? nanoid()),
        task_id:          String(params['task_id']    ?? ctx.taskId    ?? nanoid()),
        sender:           'agent_b',
        recipient:        'agent_a',
        context: {
          current_page: 'job_application',
          company:      String(params['company'] ?? 'Unknown'),
          role:         String(params['role']    ?? 'Unknown'),
        },
        problem: {
          type:     'application_question',
          question: String(params['question'] ?? ''),
          options:  options.length > 0 ? options : undefined,
        },
        candidate_context: {
          profile_summary: buildProfileSummary(String(params['context_notes'] ?? '')),
        },
        required_response: {
          format:       'answer',
          must_include: ['answer', 'confidence', 'reasoning_summary'],
        },
      }

      const response = await provider.ask(request)

      return {
        success: true,
        output: {
          answer:           response.answer.value,
          confidence:       response.answer.confidence,
          reasoning_summary: response.reasoning_summary,
          recommended_action: response.recommended_action.type,
          decision:          response.decision.type,
        },
      }
    },
  })

  console.log('[Parallax][Tools] Reasoning tools registered: ask_reasoning_agent')
}
