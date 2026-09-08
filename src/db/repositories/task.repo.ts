import { asc, eq } from 'drizzle-orm'
import { db } from '../client.js'
import { tasks } from '../schema.js'
import type { NewTask, Task } from '../schema.js'

export async function insertTask(data: NewTask): Promise<Task> {
  const [task] = await db.insert(tasks).values(data).returning()
  if (!task) throw new Error('Failed to insert task')
  return task
}

export async function findTasksBySessionId(sessionId: string): Promise<Task[]> {
  return db.select().from(tasks).where(eq(tasks.sessionId, sessionId)).orderBy(asc(tasks.createdAt))
}

export async function updateTaskStatus(id: string, status: string): Promise<void> {
  const updated = await db.update(tasks).set({ status, updatedAt: new Date().toISOString() }).where(eq(tasks.id, id)).returning({ id: tasks.id })
  if (updated.length === 0) throw new Error('Task not found')
}