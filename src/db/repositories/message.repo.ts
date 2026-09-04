import { asc, eq } from 'drizzle-orm'
import { db } from '../client.js'
import { messages } from '../schema.js'
import type { Message, NewMessage } from '../schema.js'

export async function insertMessage(data: NewMessage): Promise<Message> {
  const [message] = await db.insert(messages).values(data).returning()
  if (!message) throw new Error('Failed to insert message')
  return message
}

export async function findMessagesBySessionId(sessionId: string): Promise<Message[]> {
  return db.select().from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
}