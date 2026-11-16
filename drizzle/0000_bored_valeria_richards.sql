CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`session_hash` text NOT NULL,
	`state_json` text NOT NULL,
	`game_schema` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_session_hash_unique` ON `games` (`session_hash`);
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`) VALUES ('database_schema_version', '1');