import { events, instances, rsvps, subscribers } from '$lib/db/schema';
import type { Db } from '$lib/db';
import type { InstanceStatus, RsvpStatus } from '$lib/db/schema';

/**
 * Row builders for DB tests. Each takes only what a test cares about and fills
 * in the rest, so a test reads as its scenario rather than as boilerplate.
 */

export async function makeEvent(db: Db, slug = 'craft-night', timezone = 'America/Los_Angeles') {
	const [event] = await db.insert(events).values({ name: slug, slug, timezone }).returning();
	return event;
}

export async function makeInstance(
	db: Db,
	eventId: string,
	opts: { date?: string; status?: InstanceStatus } = {}
) {
	const [instance] = await db
		.insert(instances)
		.values({
			event_id: eventId,
			date: opts.date ?? '2026-12-01',
			start_time: '18:00',
			end_time: '21:00',
			status: opts.status ?? 'confirmed'
		})
		.returning();
	return instance;
}

let guestCounter = 0;

export async function makeGuest(db: Db, eventId: string, opts: { active?: boolean } = {}) {
	guestCounter += 1;
	const [guest] = await db
		.insert(subscribers)
		.values({
			event_id: eventId,
			name: `Guest ${guestCounter}`,
			email: `guest${guestCounter}@x.com`,
			active: opts.active ?? true
		})
		.returning();
	return guest;
}

export async function rsvp(db: Db, subscriberId: string, instanceId: string, status: RsvpStatus) {
	await db.insert(rsvps).values({ subscriber_id: subscriberId, instance_id: instanceId, status });
}

export async function statusOf(db: Db, instanceId: string): Promise<InstanceStatus> {
	const rows = await db.select().from(instances);
	return rows.find((i) => i.id === instanceId)!.status as InstanceStatus;
}
