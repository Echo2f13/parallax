import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  taskId: text('task_id').references(() => tasks.id),
  type: text('type').notNull(),
  source: text('source').notNull(),
  location: text('location'),
  description: text('description').notNull(),
  contentHash: text('content_hash'),
  confidence: real('confidence').notNull().default(1),
  createdAt: text('created_at').notNull(),
})

export const hypotheses = sqliteTable('hypotheses', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  statement: text('statement').notNull(),
  confidence: real('confidence').notNull().default(0.5),
  status: text('status').notNull(),
  proposedBy: text('proposed_by').notNull(),
  evidenceIds: text('evidence_ids'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
})

export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  hypothesisId: text('hypothesis_id').references(() => hypotheses.id),
  objective: text('objective').notNull(),
  requestedBy: text('requested_by').notNull(),
  executedBy: text('executed_by').notNull(),
  actions: text('actions').notNull(),
  expectedResult: text('expected_result'),
  actualResult: text('actual_result'),
  status: text('status').notNull(),
  evidenceIds: text('evidence_ids'),
  conclusion: text('conclusion'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
})

export const experimentResults = sqliteTable('experiment_results', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull().references(() => experiments.id),
  actualResult: text('actual_result').notNull(),
  status: text('status').notNull(),
  evidenceIds: text('evidence_ids'),
  conclusion: text('conclusion'),
  createdAt: text('created_at').notNull(),
})

export const contradictions = sqliteTable('contradictions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  evidenceIdA: text('evidence_id_a').notNull().references(() => evidence.id),
  evidenceIdB: text('evidence_id_b').notNull().references(() => evidence.id),
  description: text('description').notNull(),
  status: text('status').notNull(),
  resolvedByExperimentId: text('resolved_by_experiment_id').references(() => experiments.id),
  createdAt: text('created_at').notNull(),
})

export const unknowns = sqliteTable('unknowns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  question: text('question').notNull(),
  status: text('status').notNull(),
  answeredByEvidenceId: text('answered_by_evidence_id').references(() => evidence.id),
  createdAt: text('created_at').notNull(),
})

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type ToolCall = typeof toolCalls.$inferSelect
export type NewToolCall = typeof toolCalls.$inferInsert
export type Evidence = typeof evidence.$inferSelect
export type NewEvidenceRecord = typeof evidence.$inferInsert
export type Hypothesis = typeof hypotheses.$inferSelect
export type NewHypothesisRecord = typeof hypotheses.$inferInsert
export type Experiment = typeof experiments.$inferSelect
export type NewExperimentRecord = typeof experiments.$inferInsert
export type ExperimentResultRecord = typeof experimentResults.$inferSelect
export type Contradiction = typeof contradictions.$inferSelect
export type NewContradictionRecord = typeof contradictions.$inferInsert
export type Unknown = typeof unknowns.$inferSelect