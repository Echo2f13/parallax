import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name'),
  objective: text('objective').notNull(),
  status: text('status').notNull(),
  agentAProvider: text('agent_a_provider').notNull(),
  agentBModel: text('agent_b_model').notNull(),
  workspacePath: text('workspace_path'),
  maxIterations: integer('max_iterations').notNull().default(8),
  maxRuntimeSeconds: integer('max_runtime_seconds').notNull().default(1800),
  maxAgentMessages: integer('max_agent_messages').notNull().default(100),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  terminatedAt: text('terminated_at'),
  terminationReason: text('termination_reason'),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  iteration: integer('iteration').notNull().default(0),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  taskId: text('task_id').references(() => tasks.id),
  sender: text('sender').notNull(),
  messageType: text('message_type').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
})

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  taskId: text('task_id').references(() => tasks.id),
  toolName: text('tool_name').notNull(),
  inputParams: text('input_params').notNull(),
  output: text('output'),
  permissionLevel: text('permission_level').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  exitCode: integer('exit_code'),
  error: text('error'),
})

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type ToolCall = typeof toolCalls.$inferSelect
export type NewToolCall = typeof toolCalls.$inferInsert