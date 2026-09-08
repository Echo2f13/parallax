import { createInterface } from 'node:readline'
import type { AgentProvider, AgentRequest, AgentResponse, HealthStatus } from '../interfaces/agent.provider.js'
import { validateAgentResponse } from '../../protocol/validator.js'

export class ManualRelayAdapter implements AgentProvider {
  readonly name = 'manual'

  async send(request: AgentRequest): Promise<AgentResponse> {
    const startedAt = Date.now()
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[Parallax] MANUAL RELAY — Agent A Input Required')
      console.log(`Session: ${request.sessionId}  Iteration: ${request.request.context.iteration}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Copy this to ChatGPT:\n')
      console.log(JSON.stringify(request.request, null, 2))
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Paste ChatGPT response below (END on its own line):')
      const input = await this.readResponse()
      let parsed: unknown
      try {
        parsed = JSON.parse(input) as unknown
      } catch {
        console.log('[Parallax][ManualRelay] Invalid JSON. Please try again.')
        continue
      }
      const validation = validateAgentResponse(parsed)
      if (validation.valid) {
        return { result: validation.data, rawResponse: input, model: 'manual-relay', durationMs: Date.now() - startedAt }
      }
      console.log(`[Parallax][ManualRelay] Invalid response: ${validation.errors.join(', ')}`)
    }
    throw new Error('ManualRelayAdapter: response failed validation after 3 attempts')
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, message: 'Manual relay is always available' }
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const readline = createInterface({ input: process.stdin, terminal: false })
      const lines: string[] = []
      let emptyLines = 0
      readline.on('line', line => {
        if (line.trim() === 'END') {
          readline.close()
          resolve(lines.join('\n'))
          return
        }
        if (line.trim() === '') emptyLines += 1
        else emptyLines = 0
        if (emptyLines >= 2) {
          readline.close()
          resolve(lines.join('\n'))
          return
        }
        lines.push(line)
      })
      readline.on('error', reject)
    })
  }
}