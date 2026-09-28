CREATE TABLE `custom_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`formula` text NOT NULL,
	`position` integer NOT NULL,
	`empty_count` integer,
	`created_at` text NOT NULL,
	`edited_at` text NOT NULL
);
