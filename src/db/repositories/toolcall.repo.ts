import { eq } from 'drizzle-orm'
import { db } from '../client.js'
import { toolCalls } from '../schema.js'
import type { NewToolCall, ToolCall } from '../schema.js'

export async function insertToolCall(data: NewToolCall): Promise<ToolCall> {
  const [toolCall] = await db.insert(toolCalls).values(data).returning()
  if (!toolCall) throw new Error('Failed to insert tool call')
  return toolCall
}

export async function updateToolCall(id: string, result: Partial<ToolCall>): Promise<void> {
  const updated = await db.update(toolCalls).set(result).where(eq(toolCalls.id, id)).returning({ id: toolCalls.id })
  if (updated.length === 0) throw new Error('Tool call not found')
}