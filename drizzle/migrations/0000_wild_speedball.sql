CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`cover_image_url` text,
	`accent_color` text,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_idx` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `instances` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`location` text,
	`description` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "instances_status_check" CHECK(status IN ('proposed', 'confirmed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `instances_event_id_idx` ON `instances` (`event_id`);--> statement-breakpoint
CREATE INDEX `instances_event_date_idx` ON `instances` (`event_id`,`date`);--> statement-breakpoint
CREATE INDEX `instances_event_status_idx` ON `instances` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriber_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rsvps_status_check" CHECK(status IN ('yes', 'maybe', 'no'))
);
--> statement-breakpoint
CREATE INDEX `rsvps_instance_id_idx` ON `rsvps` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_subscriber_instance_idx` ON `rsvps` (`subscriber_id`,`instance_id`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subscribers_contact_check" CHECK(email IS NOT NULL OR phone IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `subscribers_event_id_idx` ON `subscribers` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_event_email_idx` ON `subscribers` (`event_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_event_phone_idx` ON `subscribers` (`event_id`,`phone`);