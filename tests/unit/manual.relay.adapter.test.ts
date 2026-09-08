import { beforeEach, describe, expect, it, vi } from 'vitest'

const readlineMock = vi.hoisted(() => ({ batches: [] as string[][], createInterface: vi.fn() }))

vi.mock('node:readline', () => ({ createInterface: readlineMock.createInterface }))

import { ManualRelayAdapter } from '../../src/agents/chatgpt/manual.adapter.js'
import type { AgentRequest } from '../../src/agents/interfaces/agent.provider.js'

const validResult = {
  message_type: 'investigation_result', protocol_version: '1.0', session_id: 'session', task_id: 'task', sender: 'agent_a', recipient: 'orchestrator', status: 'completed',
  observations: [], evidence: [], experiments: [], conclusions: [], remaining_unknowns: [], recommended_next_action: 'CONCLUDE', agent_assessment: 'neutral',
}

const request: AgentRequest = {
  sessionId: 'session', request: {
    message_type: 'investigation_request', protocol_version: '1.0', session_id: 'session', task_id: 'task', sender: 'orchestrator', recipient: 'agent_a', objective: 'test', hypotheses: [], requested_actions: [], required_output: [],
    context: { current_state: 'PLANNING', iteration: 0, confirmed_facts: [], unresolved_questions: [], recent_experiments: [] }, constraints: { max_tool_calls: 1, workspace_path: '.' }, output_schema: {},
  },
}

describe('ManualRelayAdapter', () => {
  beforeEach(() => {
    readlineMock.createInterface.mockImplementation(() => {
      const listeners: Record<string, (value?: string) => void> = {}
      const lines = readlineMock.batches.shift() ?? []
      const interfaceObject = {
        on(event: string, listener: (value?: string) => void): typeof interfaceObject {
          listeners[event] = listener
          if (event === 'line') queueMicrotask(() => lines.forEach(line => listener(line)))
          return interfaceObject
        },
        close: vi.fn(),
      }
      return interfaceObject
    })
  })

  it('parses and returns a valid response', async () => {
    readlineMock.batches = [[JSON.stringify(validResult), 'END']]
    await expect(new ManualRelayAdapter().send(request)).resolves.toMatchObject({ result: validResult, model: 'manual-relay' })
  })

  it('asks the user to retry after malformed input', async () => {
    readlineMock.batches = [['not json', 'END'], [JSON.stringify(validResult), 'END']]
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await expect(new ManualRelayAdapter().send(request)).resolves.toMatchObject({ result: validResult })
    expect(output).toHaveBeenCalledWith('[Parallax][ManualRelay] Invalid JSON. Please try again.')
    output.mockRestore()
  })

  it('throws after three failed attempts', async () => {
    readlineMock.batches = [['bad', 'END'], ['bad', 'END'], ['bad', 'END']]
    await expect(new ManualRelayAdapter().send(request)).rejects.toThrow('after 3 attempts')
  })
})