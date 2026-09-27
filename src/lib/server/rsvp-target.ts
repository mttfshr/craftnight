import { and, eq } from 'drizzle-orm';
import { instances } from '$lib/db/schema';
import { isPast } from '$lib/utils/dates';
import type { Db } from '$lib/db';
import type { Instance } from '$lib/db/schema';

export type RsvpTarget = { instance: Instance; err: null } | { instance: null; err: string };

/**
 * Loads the instance a guest is trying to RSVP to and decides whether they may
 * (FR-046). Used by both the first-time and returning-guest actions, and run
 * server-side on every submit, so a stale open page can't record a late or
 * wrong RSVP.
 *
 * Status matters (FR-050, T084):
 *   - `confirmed`  accepted
 *   - `proposed`   accepted — guests RSVP to every candidate of a date poll
 *   - `cancelled`  REJECTED. A guest whose page was open while the organizer
 *     confirmed another date would otherwise record an RSVP against a
 *     candidate that no longer appears anywhere public. The earlier note that
 *     these actions "need no status filter" was true for proposed and wrong for
 *     cancelled.
 *
 * The date is compared against today in the Event's own timezone (FR-020), so
 * `now` is injectable for tests.
 */
export async function loadRsvpTarget(
	db: Db,
	instanceId: unknown,
	eventId: string,
	timezone: string,
	now?: Date
): Promise<RsvpTarget> {
	if (typeof instanceId !== 'string' || !instanceId) {
		return { instance: null, err: 'No instance specified.' };
	}

	const [instance] = await db
		.select()
		.from(instances)
		.where(and(eq(instances.id, instanceId), eq(instances.event_id, eventId)));
	if (!instance) return { instance: null, err: 'Instance not found.' };

	// Checked before the date: "cancelled" is the more useful thing to tell
	// someone than "passed" when both are true.
	if (instance.status === 'cancelled') {
		return { instance: null, err: 'This date was cancelled.' };
	}
	if (isPast(instance.date, timezone, now)) {
		return { instance: null, err: 'This event has already passed.' };
	}

	return { instance, err: null };
}
