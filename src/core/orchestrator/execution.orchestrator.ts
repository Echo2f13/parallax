/**
 * src/core/orchestrator/execution.orchestrator.ts
 *
 * Job-application execution loop using TEXT-BASED tool calling.
 *
 * Instead of relying on Ollama's native tool-calling API (which 7B models
 * use inconsistently), we ask Ollama to respond with a structured JSON action,
 * parse it ourselves, execute the tool, and feed the result back.
 *
 * This pattern works reliably with qwen2.5:7b and qwen2.5-coder:7b.
 *
 * Loop: OBSERVE → DECIDE → ACT → OBSERVE → ...
 *
 * Each turn:
 *   1. Send Ollama the current page state + history
 *   2. Ollama responds with: { "tool": "...", "args": { ... } }
 *   3. We execute the tool and append the result
 *   4. Repeat until Ollama responds with { "tool": "done", ... }
 */

import { nanoid } from 'nanoid'
import { Ollama } from 'ollama'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from '../../config/config.js'
import * as messageRepo from '../../db/repositories/message.repo.js'
import * as taskRepo from '../../db/repositories/task.repo.js'
import { TerminationEngine } from '../termination/termination.engine.js'
import * as sessionManager from '../sessions/session.manager.js'
import { ToolExecutor } from '../../tools/registry/tool.executor.js'
import { getExecutionProvider } from '../../execution/execution.store.js'

const TERMINAL_STATUSES: sessionManager.SessionStatus[] = ['CONCLUDED', 'STOPPED', 'BLOCKED', 'ERROR']

// ── Candidate profile (loaded once at startup) ────────────────────────────────
interface CandidateProfile {
  jobRoles: string[]
  skills: string[]
  locations: string[]
  experience: number
  summary: string
  currentLocation: string
}

const CANDIDATE_PROFILE: CandidateProfile = (() => {
  const profilePaths = [
    resolve(process.cwd(), '../../../others/rohanth/autoapply/naukri-autoapply/config/profile.json'),
    resolve(process.cwd(), 'config/profile.json'),
  ]
  for (const p of profilePaths) {
    try {
      const raw  = readFileSync(p, 'utf8')
      const prof = JSON.parse(raw) as Partial<CandidateProfile>
      if (Array.isArray(prof.jobRoles) && prof.jobRoles.length > 0) {
        console.log(`[Parallax][ExecutionOrchestrator] Loaded profile from ${p}`)
        return {
          jobRoles:        (prof.jobRoles        ?? []).map(r => r.toLowerCase()),
          skills:          prof.skills           ?? [],
          locations:       prof.locations        ?? ['Hyderabad'],
          experience:      prof.experience       ?? 2,
          summary:         prof.summary          ?? '',
          currentLocation: prof.currentLocation  ?? 'Hyderabad',
        }
      }
    } catch { /* not found — try next */ }
  }
  console.warn('[Parallax][ExecutionOrchestrator] profile.json not found — using defaults')
  return {
    jobRoles:        ['software developer', 'backend developer', 'software engineer'],
    skills:          ['Python', 'Node.js', 'React', 'Django', 'JavaScript'],
    locations:       ['Hyderabad'],
    experience:      2,
    summary:         'Software engineer with 2 years experience',
    currentLocation: 'Hyderabad',
  }
})()

/** True if the job role matches any of the candidate's preferred roles */
function isRoleMatch(role: string): boolean {
  const r = role.toLowerCase()
  return CANDIDATE_PROFILE.jobRoles.some(
    preferred => r.includes(preferred) || preferred.includes(r)
  )
}

/** Compact profile summary sent to Ollama for ranking */
const PROFILE_CONTEXT = `
CANDIDATE PROFILE:
- Roles wanted: ${CANDIDATE_PROFILE.jobRoles.map(r => r.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ')}
- Skills: ${CANDIDATE_PROFILE.skills.slice(0, 15).join(', ')}
- Experience: ${CANDIDATE_PROFILE.experience} years
- Location: ${CANDIDATE_PROFILE.currentLocation} (open to: ${CANDIDATE_PROFILE.locations.join(', ')})
- Summary: ${CANDIDATE_PROFILE.summary}
`.trim()

/** Search keyword from profile (first job role, title-cased) */
const SEARCH_KEYWORD = CANDIDATE_PROFILE.jobRoles[0]
  ?.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') ?? 'Software Engineer'
/** Primary location from profile */
const SEARCH_LOCATION = CANDIDATE_PROFILE.locations[0] ?? 'Hyderabad'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a job application agent. You control a browser by outputting ONE JSON action per turn.

AVAILABLE ACTIONS:
{"tool":"get_page_state","args":{}}
{"tool":"inspect_jobs","args":{"mode":"search","keyword":"Software Engineer","location":"Hyderabad"}}
{"tool":"read_job_detail","args":{"job_url":"URL"}}
{"tool":"apply_to_job","args":{"job_url":"URL","role":"ROLE","company":"COMPANY","location":"LOCATION","experience":"EXP"}}
{"tool":"resolve_answer","args":{"question":"Q","options":"opt1,opt2"}}
{"tool":"fill_answer","args":{"question":"Q","options":"opt1,opt2","answer":"A","source":"profile"}}
{"tool":"advance_form","args":{}}
{"tool":"verify_application","args":{}}
{"tool":"ask_reasoning_agent","args":{"question":"Q","options":"opt1","company":"C","role":"R"}}
{"tool":"done","args":{"summary":"Applied to N jobs","applications_submitted":N}}
{"tool":"blocked","args":{"summary":"reason"}}

RULES:
- Output ONLY the JSON object. No explanation. No markdown. No extra text.
- Start with get_page_state.
- After get_page_state → call inspect_jobs in search mode with the keyword and location you are given.
- You will receive a ranked list of up to 10 jobs. Pick the BEST match for the candidate profile (most skill overlap, right role title, not already applied).
- Call read_job_detail on the best match to confirm it is a genuine fit and applyType is "naukri".
- If applyType is "external" → skip that job and call read_job_detail on the next best match.
- Once confirmed → call apply_to_job.
- After apply_to_job → if the result contains a pendingQuestion, call resolve_answer immediately.
- If resolve_answer returns a non-null answer → call fill_answer then advance_form.
- After advance_form → if pendingQuestion in result, call resolve_answer again. Repeat until no more questions.
- If resolve_answer returns null → call ask_reasoning_agent.
- Do NOT use ask_reasoning_agent for: name, email, phone, location, notice period, CTC, years of experience, yes/no skill questions.
- After all questions done and form submitted → call verify_application.
- If no pendingQuestion after apply → call verify_application directly.
- When done → use done.
- If stuck → use blocked.

EXAMPLE EXCHANGE (follow this pattern exactly):
USER: Start now. Output your first JSON action.
ASSISTANT: {"tool":"get_page_state","args":{}}
USER: Result of get_page_state: {"url":"https://www.naukri.com","uiType":"home"}
Now call inspect_jobs in search mode.
ASSISTANT: {"tool":"inspect_jobs","args":{"mode":"search","keyword":"Software Engineer","location":"Hyderabad"}}
USER: Result of inspect_jobs - 3 matching jobs: [{"role":"Software Engineer","company":"Acme","job_url":"https://www.naukri.com/job/1","experience":"1-3 years"},{"role":"Backend Developer","company":"Beta","job_url":"https://www.naukri.com/job/2","experience":"2-4 years"}]
CANDIDATE PROFILE: Roles wanted: Software Developer, Backend Developer. Skills: Python, Django, Node.js. Experience: 2 years.
Pick the BEST matching job. Call read_job_detail with that job_url to confirm before applying.
ASSISTANT: {"tool":"read_job_detail","args":{"job_url":"https://www.naukri.com/job/2"}}
USER: Result of read_job_detail: {"ok":true,"title":"Backend Developer","company":"Beta","applyType":"naukri","skills":["Python","Django"],"description":"We need a backend developer..."}
This job can be applied to directly on Naukri (applyType="naukri"). Call apply_to_job now.
ASSISTANT: {"tool":"apply_to_job","args":{"job_url":"https://www.naukri.com/job/2","role":"Backend Developer","company":"Beta","location":"Hyderabad","experience":"2-4 years"}}
USER: Result of apply_to_job: {"ok":true,"applyClicked":true}
The chatbot is open. Current question: "Years of experience?" Options: 0-1, 1-3, 3-5
Call resolve_answer with this exact question and options now.
ASSISTANT: {"tool":"resolve_answer","args":{"question":"Years of experience?","options":"0-1,1-3,3-5"}}`

// ── Tool name → ExecutionProvider method mapping ──────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
  taskId: string,
  workspacePath: string,
  toolExecutor: ToolExecutor,
): Promise<unknown> {
  const provider = getExecutionProvider()

  switch (toolName) {
    case 'get_page_state': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.getPageState()
    }
    case 'inspect_jobs': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.getJobs({
        mode: (args['mode'] as 'recommended' | 'search') ?? 'recommended',
        keyword:  args['keyword']  ? String(args['keyword'])  : undefined,
        location: args['location'] ? String(args['location']) : undefined,
        experienceLevels: [0, 1],
        maxPages: 2,
      })
    }
    case 'apply_to_job': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.beginApply({
        jobUrl:     String(args['job_url'] ?? args['jobUrl'] ?? ''),
        role:       String(args['role']      ?? 'Unknown'),
        company:    String(args['company']   ?? 'Unknown'),
        location:   String(args['location']  ?? ''),
        experience: String(args['experience'] ?? ''),
      })
    }
    case 'resolve_answer': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      const options = args['options']
        ? String(args['options']).split(',').map(s => s.trim()).filter(Boolean)
        : []
      return provider.resolveAnswer(
        String(args['question'] ?? ''),
        options,
        String(args['source'] ?? 'naukri'),
      )
    }
    case 'fill_answer': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      const options = args['options']
        ? String(args['options']).split(',').map(s => s.trim()).filter(Boolean)
        : []
      return provider.fillAnswer(
        String(args['question'] ?? ''),
        options,
        String(args['answer']   ?? ''),
        args['source'] ? String(args['source']) : undefined,
      )
    }
    case 'advance_form': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.advanceForm()
    }
    case 'verify_application': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.verifyApplication()
    }
    case 'read_job_detail': {
      if (!provider) throw new Error('ExecutionProvider not connected')
      return provider.readJobDetail(String(args['job_url'] ?? args['jobUrl'] ?? ''))
    }
    default: {
      // Fall through to the ToolRegistry for ask_reasoning_agent and other tools
      const result = await toolExecutor.execute(
        toolName,
        args,
        { sessionId, taskId, workspacePath },
        sessionId,
        taskId,
      )
      return result.output
    }
  }
}

// ── Parse Ollama's JSON response ──────────────────────────────────────────────

function parseAction(raw: string): { tool: string; args: Record<string, unknown> } | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Find the first {...} block
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    if (typeof parsed['tool'] !== 'string') return null
    return {
      tool: parsed['tool'],
      args: (parsed['args'] as Record<string, unknown>) ?? {},
    }
  } catch {
    return null
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class ExecutionOrchestrator {
  private readonly terminationEngine = new TerminationEngine()
  private readonly toolExecutor = new ToolExecutor()

  async run(sessionId: string, objective: string): Promise<void> {
    const session   = await sessionManager.getSession(sessionId)
    const taskId    = nanoid()
    const startedAt = new Date()
    let iteration   = 0
    let messageCount = 0
    let taskCreated  = false

    const model  = session.agentBModel || config.ollamaDefaultModel
    const client = new Ollama({ host: config.ollamaBaseUrl })

    // Conversation history — simple string-based, no tool_calls objects
    type SimpleMessage = { role: 'system' | 'user' | 'assistant'; content: string }
    const messages: SimpleMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Task: ${objective}\n\n` +
          `${PROFILE_CONTEXT}\n\n` +
          `Search keyword to use: "${SEARCH_KEYWORD}"\n` +
          `Location to use: "${SEARCH_LOCATION}"\n\n` +
          `Start now. Output your first JSON action.`,
      },
    ]

    try {
      await taskRepo.insertTask({
        id: taskId, sessionId,
        title: 'Execution task',
        description: objective,
        status: 'RUNNING',
        createdAt: startedAt.toISOString(),
      })
      taskCreated = true

      await sessionManager.updateStatus(sessionId, 'INVESTIGATING')
      await this.log(sessionId, `ExecutionOrchestrator started. Model: ${model}`)

      let consecutiveParseFailures = 0

      while (true) {
        // External stop / budget checks
        const currentSession = await sessionManager.getSession(sessionId)
        if (TERMINAL_STATUSES.includes(currentSession.status as sessionManager.SessionStatus)) {
          await this.log(sessionId, `Session externally terminated (${currentSession.status})`)
          break
        }
        const termCheck = this.terminationEngine.check(currentSession, iteration, messageCount, startedAt)
        if (termCheck.shouldTerminate) {
          await sessionManager.updateStatus(sessionId, 'CONCLUDED', termCheck.reason)
          await this.log(sessionId, `Budget reached: ${termCheck.reason}`)
          if (taskCreated) await taskRepo.updateTaskStatus(taskId, 'COMPLETED').catch(() => {})
          return
        }

        // ── Ask Ollama for next action ──────────────────────────────────────
        const response = await client.chat({
          model,
          messages,
          // No tools array — text-based tool use only
        })

        messageCount += 1
        iteration    += 1

        const rawContent = (response.message.content ?? '').trim()
        messages.push({ role: 'assistant', content: rawContent })

        await messageRepo.insertMessage({
          id: nanoid(), sessionId, taskId,
          sender: 'agent_b',
          messageType: 'tool_call',
          payload: JSON.stringify({ content: rawContent }),
          createdAt: new Date().toISOString(),
        })

        // ── Parse the action ────────────────────────────────────────────────
        const action = parseAction(rawContent)

        if (!action) {
          consecutiveParseFailures += 1
          await this.log(sessionId, `Parse failure #${consecutiveParseFailures}: ${rawContent.slice(0, 100)}`)

          if (consecutiveParseFailures >= 3) {
            await sessionManager.updateStatus(sessionId, 'BLOCKED', 'Model not producing valid JSON actions after 3 attempts')
            await taskRepo.updateTaskStatus(taskId, 'FAILED').catch(() => {})
            return
          }

          messages.push({
            role: 'user',
            content: 'Invalid response. Output ONLY a JSON object like: {"tool":"get_page_state","args":{}}',
          })
          continue
        }

        consecutiveParseFailures = 0
        await this.log(sessionId, `→ ${action.tool}(${JSON.stringify(action.args).slice(0, 150)})`)

        // ── Terminal actions ────────────────────────────────────────────────
        if (action.tool === 'done') {
          const summary = String(action.args['summary'] ?? 'Completed')
          await sessionManager.updateStatus(sessionId, 'CONCLUDED', summary)
          await taskRepo.updateTaskStatus(taskId, 'COMPLETED')
          await this.log(sessionId, `Done: ${summary}`)
          return
        }

        if (action.tool === 'blocked') {
          const summary = String(action.args['summary'] ?? 'Blocked')
          await sessionManager.updateStatus(sessionId, 'BLOCKED', summary)
          await taskRepo.updateTaskStatus(taskId, 'COMPLETED')
          await this.log(sessionId, `Blocked: ${summary}`)
          return
        }

        // ── Execute the tool ────────────────────────────────────────────────
        let toolResult: unknown
        try {
          toolResult = await executeTool(
            action.tool,
            action.args,
            sessionId,
            taskId,
            currentSession.workspacePath ?? config.workspacePath,
            this.toolExecutor,
          )

          // ALREADY_APPLIED: job was previously applied — this session is done.
          // Stop immediately rather than letting the model loop endlessly.
          if (
            action.tool === 'apply_to_job' &&
            toolResult !== null &&
            typeof toolResult === 'object' &&
            (toolResult as Record<string, unknown>)['status'] === 'ALREADY_APPLIED'
          ) {
            await sessionManager.updateStatus(sessionId, 'CONCLUDED', 'Job already applied — no new applications available in this batch')
            await taskRepo.updateTaskStatus(taskId, 'COMPLETED')
            await this.log(sessionId, 'apply_to_job returned ALREADY_APPLIED — concluding session')
            return
          }

          // Filter to roles matching the candidate profile.
          // Return top 10 so Ollama can rank them by skills overlap.
          if (action.tool === 'inspect_jobs' && Array.isArray(toolResult)) {
            const jobs = toolResult as unknown[]
            const matching = jobs
              .filter((j: unknown) => {
                const job = j as Record<string, unknown>
                return isRoleMatch(String(job['role'] ?? ''))
              })
              .slice(0, 10)
              .map((j: unknown) => {
                const job = j as Record<string, unknown>
                return {
                  role:       job['role'],
                  company:    job['company'],
                  job_url:    job['jobUrl'] ?? job['job_url'],
                  location:   job['location'],
                  experience: job['experience'],
                  posted:     job['postedAge'],
                }
              })

            if (matching.length === 0) {
              toolResult = null
              await this.log(sessionId, `← inspect_jobs: no role-matching jobs in ${jobs.length} results`)
            } else {
              toolResult = matching
              await this.log(sessionId, `← inspect_jobs: ${matching.length} matching jobs from ${jobs.length} total`)
            }
          } else {
            await this.log(sessionId, `← ${action.tool}: ${JSON.stringify(toolResult).slice(0, 200)}`)
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          toolResult = { error: errMsg, tool: action.tool }
          await this.log(sessionId, `← ${action.tool} ERROR: ${errMsg}`)
        }

        // For inspect_jobs: push two separate messages — the data, then the command.
        // Splitting prevents the model treating the instruction as commentary on the data.
        // For all other tools: push a single combined message.
        if (action.tool === 'inspect_jobs') {
          if (toolResult === null) {
            messages.push({
              role: 'user',
              content: 'Result of inspect_jobs: no matching jobs available.',
            })
            messages.push({
              role: 'user',
              content: 'No matching jobs found. Call blocked with summary "No suitable jobs found".',
            })
          } else {
            // Send the list + profile context so Ollama can rank properly
            messages.push({
              role: 'user',
              content:
                `Result of inspect_jobs — ${(toolResult as unknown[]).length} matching jobs:\n` +
                `${JSON.stringify(toolResult, null, 2)}\n\n` +
                `${PROFILE_CONTEXT}\n\n` +
                `Pick the BEST matching job for this candidate (most skill overlap, correct role title, preferably in ${SEARCH_LOCATION}).\n` +
                `Call read_job_detail with that job's job_url to confirm it before applying.`,
            })
          }
        } else if (action.tool === 'read_job_detail') {
          const detail = toolResult as Record<string, unknown>
          const applyType = detail['applyType'] as string | undefined

          if (applyType === 'external') {
            await this.log(sessionId, `← read_job_detail: external apply — skipping`)
            messages.push({
              role: 'user',
              content:
                `Result of read_job_detail:\n${JSON.stringify(toolResult, null, 2)}\n\n` +
                `This job requires applying on an external website (applyType="external"). Skip it.\n` +
                `Call read_job_detail on the next best matching job from your list.`,
            })
          } else {
            await this.log(sessionId, `← read_job_detail: applyType="${applyType}" — good to apply`)
            messages.push({
              role: 'user',
              content:
                `Result of read_job_detail:\n${JSON.stringify(toolResult, null, 2)}\n\n` +
                `This job can be applied to directly on Naukri (applyType="${applyType}").\n` +
                `Call apply_to_job with job_url="${detail['jobUrl'] ?? detail['job_url'] ?? action.args['job_url']}", role="${detail['title']}", company="${detail['company']}", location="${detail['location'] ?? ''}", experience="${detail['experience']}" now.`,
            })
          }
        } else if (action.tool === 'apply_to_job') {
          // After applying, check if the response includes a pending question from the chatbot.
          // If so, inject it directly so Ollama knows exactly what to answer next
          // rather than having to call get_page_state first.
          const applyResult = toolResult as Record<string, unknown>
          const pageState   = applyResult['pageState'] as Record<string, unknown> | undefined
          const pending     = pageState?.['pendingQuestion'] as Record<string, unknown> | null | undefined

          if (pending && pending['question']) {
            const pq      = pending['question'] as string
            const opts    = (pending['options'] as string[] | undefined) ?? []
            const uiType  = pending['uiType']  as string | undefined

            await this.log(sessionId, `← apply_to_job: chatbot open, question="${pq.slice(0, 80)}"`)

            // Message 1: the full apply result (for context)
            messages.push({
              role: 'user',
              content: `Result of apply_to_job:\n${JSON.stringify(toolResult, null, 2)}`,
            })
            // Message 2: clear imperative — resolve this question now
            messages.push({
              role: 'user',
              content:
                `The chatbot is open. Current question:\n` +
                `Question: "${pq}"\n` +
                `Options: ${opts.length > 0 ? opts.join(', ') : '(free text)'}\n` +
                `UI type: ${uiType ?? 'unknown'}\n\n` +
                `Call resolve_answer with this exact question and options now.`,
            })
          } else {
            // No chatbot question — may be quick-apply or external redirect
            await this.log(sessionId, `← apply_to_job: no pending question (quick-apply or external)`)
            messages.push({
              role: 'user',
              content: `Result of apply_to_job:\n${JSON.stringify(toolResult, null, 2)}\n\nCall verify_application now.`,
            })
          }
        } else {
          // For all other tools including advance_form: check if the result contains
          // a new pendingQuestion (chatbot moved to next question after Send/Next).
          // If so, inject it directly rather than waiting for Ollama to call get_page_state.
          if (action.tool === 'get_page_state') {
            // After observing the page, direct Ollama to search for jobs using profile data
            messages.push({
              role: 'user',
              content:
                `Result of get_page_state:\n${JSON.stringify(toolResult, null, 2)}\n\n` +
                `Now call inspect_jobs in search mode:\n` +
                `{"tool":"inspect_jobs","args":{"mode":"search","keyword":"${SEARCH_KEYWORD}","location":"${SEARCH_LOCATION}"}}`,
            })
          } else if (action.tool === 'advance_form' && toolResult !== null && typeof toolResult === 'object') {
            const advResult = toolResult as Record<string, unknown>
            const advPage   = advResult['pageState'] as Record<string, unknown> | undefined
            const advPQ     = advPage?.['pendingQuestion'] as Record<string, unknown> | null | undefined

            if (advPQ && advPQ['question']) {
              const pq   = advPQ['question'] as string
              const opts = (advPQ['options'] as string[] | undefined) ?? []
              await this.log(sessionId, `← advance_form: next question="${pq.slice(0, 80)}"`)
              messages.push({
                role: 'user',
                content: `Result of advance_form:\n${JSON.stringify(toolResult, null, 2)}`,
              })
              messages.push({
                role: 'user',
                content:
                  `Next chatbot question:\n` +
                  `Question: "${pq}"\n` +
                  `Options: ${opts.length > 0 ? opts.join(', ') : '(free text)'}\n\n` +
                  `Call resolve_answer with this exact question and options now.`,
              })
            } else if (
              advPage &&
              (advPage['uiType'] === 'chatbot_overlay' || advPage['uiType'] === 'classic_form')
            ) {
              // Chatbot is still open but no question visible yet — re-read the page
              await this.log(sessionId, `← advance_form: chatbot still open but no question yet — will re-read page`)
              messages.push({
                role: 'user',
                content:
                  `Result of advance_form:\n${JSON.stringify(toolResult, null, 2)}\n\n` +
                  `Chatbot is still open but no question visible yet. ` +
                  `Call get_page_state now to read the next question.`,
              })
            } else {
              messages.push({
                role: 'user',
                content: `Result of advance_form:\n${JSON.stringify(toolResult, null, 2)}\n\nNo more questions. Call verify_application now.`,
              })
            }
          } else {
            messages.push({
              role: 'user',
              content: `Result of ${action.tool}:\n${JSON.stringify(toolResult, null, 2)}\n\nOutput your next JSON action.`,
            })
          }
        }

        await messageRepo.insertMessage({
          id: nanoid(), sessionId, taskId,
          sender: 'orchestrator',
          messageType: 'tool_result',
          payload: JSON.stringify({ tool: action.tool, result: toolResult }),
          createdAt: new Date().toISOString(),
        })
      }

      if (taskCreated) await taskRepo.updateTaskStatus(taskId, 'COMPLETED').catch(() => {})
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      await sessionManager.updateStatus(sessionId, 'ERROR', msg)
      await this.log(sessionId, `Run failed: ${msg}`)
      if (taskCreated) await taskRepo.updateTaskStatus(taskId, 'FAILED').catch(() => {})
      throw error
    }
  }

  private async log(sessionId: string, message: string): Promise<void> {
    console.log(`[Parallax][ExecutionOrchestrator] ${message}`)
    await messageRepo.insertMessage({
      id: nanoid(), sessionId,
      sender: 'orchestrator',
      messageType: 'system',
      payload: JSON.stringify({ message }),
      createdAt: new Date().toISOString(),
    }).catch(() => {})
  }
}
