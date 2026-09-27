import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { instances, rsvps, subscribers } from '$lib/db/schema';
import type { Db } from '$lib/db';

/**
 * Date polls (ADR-005, FR-047-055). A poll is just several `proposed`
 * instances of one Event; there is no poll entity. These are the two operations
 * that need more than a plain query.
 */

export type ConfirmResult =
	| { ok: true; confirmedId: string; cancelledIds: string[] }
	| { ok: false; reason: 'not_found' | 'not_proposed' };

/**
 * Confirms one proposed candidate and cancels every other proposed candidate of
 * the same Event (FR-052).
 *
 * The target is validated first, and that is not optional. Without the
 * `proposed` check, "confirming" an already-cancelled candidate would resurrect
 * it AND cancel every live one. Without the event check, an id from another
 * Event would flip that Event's poll.
 *
 * The two UPDATEs go through one `db.batch()`. D1 has no interactive
 * transactions, but a batch is applied atomically: if a statement fails, the
 * whole batch rolls back (tests/polls.test.ts checks that against real D1
 * rather than trusting the docs). The pre-read leaves a window between check
 * and write, which is fine for a single organizer: a double-clicked button
 * loses cleanly, because the second call sees the target is no longer
 * `proposed`.
 *
 * RSVPs on cancelled candidates are kept, not deleted (FR-054).
 */
export async function confirmInstance(
	db: Db,
	eventId: string,
	instanceId: string
): Promise<ConfirmResult> {
	const [target] = await db
		.select()
		.from(instances)
		.where(and(eq(instances.id, instanceId), eq(instances.event_id, eventId)));
	if (!target) return { ok: false, reason: 'not_found' };
	if (target.status !== 'proposed') return { ok: false, reason: 'not_proposed' };

	const others = await db
		.select({ id: instances.id })
		.from(instances)
		.where(
			and(
				eq(instances.event_id, eventId),
				eq(instances.status, 'proposed'),
				ne(instances.id, instanceId)
			)
		);

	await db.batch([
		db
			.update(instances)
			.set({ status: 'confirmed' })
			.where(
				and(
					eq(instances.id, instanceId),
					eq(instances.event_id, eventId),
					eq(instances.status, 'proposed')
				)
			),
		db
			.update(instances)
			.set({ status: 'cancelled' })
			.where(
				and(
					eq(instances.event_id, eventId),
					eq(instances.status, 'proposed'),
					ne(instances.id, instanceId)
				)
			)
	]);

	return { ok: true, confirmedId: instanceId, cancelledIds: others.map((o) => o.id) };
}

export interface Tally {
	yes: number;
	maybe: number;
	no: number;
}

/**
 * RSVP counts per instance, so candidates can be compared side by side
 * (FR-051). Every requested id is present in the result, with zeros if nobody
 * has answered. Guests who have unsubscribed are not counted — the same rule
 * as the instance dashboard, so the two never disagree.
 */
export async function rsvpTallies(
	db: Db,
	instanceIds: string[]
): Promise<Record<string, Tally>> {
	const tallies: Record<string, Tally> = Object.fromEntries(
		instanceIds.map((id) => [id, { yes: 0, maybe: 0, no: 0 }])
	);
	if (instanceIds.length === 0) return tallies;

	const rows = await db
		.select({
			instanceId: rsvps.instance_id,
			status: rsvps.status,
			count: sql<number>`count(*)`
		})
		.from(rsvps)
		.innerJoin(subscribers, eq(subscribers.id, rsvps.subscriber_id))
		.where(and(inArray(rsvps.instance_id, instanceIds), eq(subscribers.active, true)))
		.groupBy(rsvps.instance_id, rsvps.status);

	for (const row of rows) {
		if (row.status === 'yes' || row.status === 'maybe' || row.status === 'no') {
			tallies[row.instanceId][row.status] = Number(row.count);
		}
	}
	return tallies;
}
