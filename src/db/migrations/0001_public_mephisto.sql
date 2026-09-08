CREATE TABLE `contradictions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`evidence_id_a` text NOT NULL,
	`evidence_id_b` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`resolved_by_experiment_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_id_a`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_id_b`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`task_id` text,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`location` text,
	`description` text NOT NULL,
	`content_hash` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `experiment_results` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`actual_result` text NOT NULL,
	`status` text NOT NULL,
	`evidence_ids` text,
	`conclusion` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`hypothesis_id` text,
	`objective` text NOT NULL,
	`requested_by` text NOT NULL,
	`executed_by` text NOT NULL,
	`actions` text NOT NULL,
	`expected_result` text,
	`actual_result` text,
	`status` text NOT NULL,
	`evidence_ids` text,
	`conclusion` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hypothesis_id`) REFERENCES `hypotheses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hypotheses` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`statement` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text NOT NULL,
	`proposed_by` text NOT NULL,
	`evidence_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unknowns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`question` text NOT NULL,
	`status` text NOT NULL,
	`answered_by_evidence_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answered_by_evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE no action
);
