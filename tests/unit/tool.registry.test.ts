import { describe, expect, it } from 'vitest'
import { ToolRegistry } from '../../src/tools/registry/tool.registry.js'

function definition(name: string) {
  return {
    name,
    description: 'test tool',
    permission_level: 'READ_ONLY' as const,
    input_schema: { type: 'object' as const, properties: {}, required: [] },
    timeout_ms: 1000,
    handler: async () => ({ success: true, output: 'ok' }),
  }
}

describe('ToolRegistry', () => {
  it('retrieves registered tools', () => {
    const registry = new ToolRegistry()
    registry.register(definition('example'))
    expect(registry.getTool('example').name).toBe('example')
  })

  it('throws for an unregistered tool', () => {
    expect(() => new ToolRegistry().getTool('missing')).toThrow('Tool not found: missing')
  })

  it('lists registered tools', () => {
    const registry = new ToolRegistry()
    registry.register(definition('one'))
    registry.register(definition('two'))
    expect(registry.listTools().map(tool => tool.name)).toEqual(['one', 'two'])
  })

  it('converts tools to Ollama format', () => {
    const registry = new ToolRegistry()
    registry.register(definition('example'))
    expect(registry.getToolsForOllama()[0]).toMatchObject({ type: 'function', function: { name: 'example', parameters: { type: 'object' } } })
  })
})