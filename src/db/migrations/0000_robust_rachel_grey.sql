CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`task_id` text,
	`sender` text NOT NULL,
	`message_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`agent_a_provider` text NOT NULL,
	`agent_b_model` text NOT NULL,
	`workspace_path` text,
	`max_iterations` integer DEFAULT 8 NOT NULL,
	`max_runtime_seconds` integer DEFAULT 1800 NOT NULL,
	`max_agent_messages` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text,
	`terminated_at` text,
	`termination_reason` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`iteration` integer DEFAULT 0 NOT NULL,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`task_id` text,
	`tool_name` text NOT NULL,
	`input_params` text NOT NULL,
	`output` text,
	`permission_level` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`exit_code` integer,
	`error` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
