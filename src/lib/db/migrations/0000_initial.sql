CREATE TABLE `comparisons` (
	`project_id` text PRIMARY KEY NOT NULL,
	`group_ids` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`filters` text NOT NULL,
	`stats` text,
	`created_at` text NOT NULL,
	`edited_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`file_name` text NOT NULL,
	`original_path` text NOT NULL,
	`event_log_path` text NOT NULL,
	`columns` text NOT NULL,
	`hidden_columns` text NOT NULL,
	`events` integer NOT NULL,
	`cases` integer NOT NULL,
	`activities` integer NOT NULL,
	`variants` integer NOT NULL,
	`timespan_start` text,
	`timespan_end` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tree_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`attributes` text NOT NULL,
	`selected_variants` text NOT NULL,
	`attributes_chosen` integer DEFAULT false NOT NULL
);
