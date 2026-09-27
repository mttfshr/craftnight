import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * SQLite (Cloudflare D1). Ported from Postgres 2026-09-27 per ADR-006.
 *
 * Conventions:
 * - Ids are text UUIDs generated in the app — SQLite has no gen_random_uuid().
 * - Dates are text 'YYYY-MM-DD' and times text 'HH:MM', so lexical ordering
 *   equals chronological ordering. Dates are interpreted in the parent
 *   Event's `timezone`, never the runtime's clock (FR-020, FR-056).
 * - Booleans are integers; timestamps are integer epoch seconds.
 * - Descriptions hold markdown SOURCE, not HTML (ADR-007).
 */

const uuid = () => text().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date());

// ─── events ─────────────────────────────────────────────────────────────────

export const events = sqliteTable(
	'events',
	{
		id: uuid().primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		description: text('description'), // markdown source
		cover_image_url: text('cover_image_url'),
		accent_color: text('accent_color'),
		// IANA identifier. Every date boundary and calendar export resolves
		// against this. A Worker has no local timezone, so it must be explicit.
		timezone: text('timezone').notNull().default('America/Los_Angeles'),
		created_at: createdAt()
	},
	(table) => [uniqueIndex('events_slug_idx').on(table.slug)]
);

// ─── instances ──────────────────────────────────────────────────────────────

export const instances = sqliteTable(
	'instances',
	{
		id: uuid().primaryKey(),
		event_id: text('event_id')
			.notNull()
			.references(() => events.id),
		date: text('date').notNull(), // YYYY-MM-DD
		start_time: text('start_time').notNull(), // HH:MM
		end_time: text('end_time').notNull(), // HH:MM
		location: text('location'),
		description: text('description'), // markdown source
		// 'proposed' | 'confirmed' | 'cancelled' — ADR-005, FR-047.
		// Folded into the initial schema rather than added by a later migration.
		status: text('status').notNull().default('confirmed'),
		created_at: createdAt()
	},
	(table) => [
		index('instances_event_id_idx').on(table.event_id),
		index('instances_event_date_idx').on(table.event_id, table.date),
		index('instances_event_status_idx').on(table.event_id, table.status),
		check('instances_status_check', sql`status IN ('proposed', 'confirmed', 'cancelled')`)
	]
);

// ─── subscribers ────────────────────────────────────────────────────────────

export const subscribers = sqliteTable(
	'subscribers',
	{
		id: uuid().primaryKey(),
		event_id: text('event_id')
			.notNull()
			.references(() => events.id),
		name: text('name').notNull(),
		email: text('email'),
		// E.164. Load-bearing: the organizer texts guests manually (FR-014a),
		// and phone is step 3 of identity resolution (FR-006b).
		phone: text('phone'),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		created_at: createdAt()
	},
	(table) => [
		index('subscribers_event_id_idx').on(table.event_id),
		// SQLite treats NULLs as distinct in a unique index, so guests with no
		// email (or no phone) do not collide with each other.
		uniqueIndex('subscribers_event_email_idx').on(table.event_id, table.email),
		uniqueIndex('subscribers_event_phone_idx').on(table.event_id, table.phone),
		check('subscribers_contact_check', sql`email IS NOT NULL OR phone IS NOT NULL`)
	]
);

// ─── rsvps ──────────────────────────────────────────────────────────────────

export const rsvps = sqliteTable(
	'rsvps',
	{
		id: uuid().primaryKey(),
		subscriber_id: text('subscriber_id')
			.notNull()
			.references(() => subscribers.id),
		instance_id: text('instance_id')
			.notNull()
			.references(() => instances.id),
		status: text('status').notNull(), // 'yes' | 'maybe' | 'no'
		created_at: createdAt(),
		// Set explicitly on insert and on conflict-update — D1 has no now().
		updated_at: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('rsvps_instance_id_idx').on(table.instance_id),
		uniqueIndex('rsvps_subscriber_instance_idx').on(table.subscriber_id, table.instance_id),
		check('rsvps_status_check', sql`status IN ('yes', 'maybe', 'no')`)
	]
);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type Event = typeof events.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type Rsvp = typeof rsvps.$inferSelect;

export type InstanceStatus = 'proposed' | 'confirmed' | 'cancelled';
export type RsvpStatus = 'yes' | 'maybe' | 'no';
