import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerFilesystemTools } from '../../src/tools/filesystem/filesystem.tools.js'
import { ToolRegistry, type ToolContext } from '../../src/tools/registry/tool.registry.js'

describe('filesystem tools', () => {
  let root: string
  let registry: ToolRegistry
  let context: ToolContext

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'parallax-'))
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'known.ts'), 'export const value = 1')
    writeFileSync(join(root, 'nested', 'other.txt'), 'nested')
    registry = new ToolRegistry()
    registerFilesystemTools(registry)
    context = { sessionId: 'test', workspacePath: root }
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('reads a known file', async () => {
    const result = await registry.getTool('read_file').handler({ path: 'known.ts' }, context)
    expect(result).toMatchObject({ success: true, output: 'export const value = 1' })
  })

  it('returns failure for a missing file', async () => {
    const result = await registry.getTool('read_file').handler({ path: 'missing.ts' }, context)
    expect(result.success).toBe(false)
  })

  it('lists directory entries', async () => {
    const result = await registry.getTool('list_directory').handler({ path: '.' }, context)
    expect(result.success).toBe(true)
    expect(result.output).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'known.ts', type: 'file' }), expect.objectContaining({ name: 'nested', type: 'directory' })]))
  })

  it('finds files by pattern', async () => {
    const result = await registry.getTool('search_files').handler({ pattern: 'known', path: '.', file_extension: '.ts' }, context)
    expect(result.output).toEqual([join(root, 'known.ts')])
  })
})