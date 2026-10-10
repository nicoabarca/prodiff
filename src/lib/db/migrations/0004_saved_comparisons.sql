CREATE TABLE `saved_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`group_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
