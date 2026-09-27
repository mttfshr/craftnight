import { subscribers } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Db } from '$lib/db';
import type { Subscriber } from '$lib/db/schema';

/**
 * Finds this event's guest by email, then by phone — in ANY active state.
 *
 * The state matters. The unique indexes on (event_id, email) and
 * (event_id, phone) cover inactive rows too, so a lookup that only searched
 * active guests would miss an unsubscribed one, fall through to the INSERT, and
 * crash on the constraint. (Proven by tests/subscribers.test.ts, T117b.)
 */
async function findByContact(
	db: Db,
	eventId: string,
	email: string | null,
	phone: string | null
): Promise<Subscriber | undefined> {
	if (email) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(and(eq(subscribers.event_id, eventId), eq(subscribers.email, email)));
		if (sub) return sub;
	}
	if (phone) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(and(eq(subscribers.event_id, eventId), eq(subscribers.phone, phone)));
		if (sub) return sub;
	}
	return undefined;
}

/** A guest who unsubscribed and came back is the same guest: flip them active. */
async function reactivate(db: Db, sub: Subscriber): Promise<Subscriber> {
	if (sub.active) return sub;
	const [row] = await db
		.update(subscribers)
		.set({ active: true })
		.where(eq(subscribers.id, sub.id))
		.returning();
	return row;
}

/**
 * Resolves a subscriber identity using 4-step priority:
 * 1. Cookie UUID match (an ACTIVE guest of this event)
 * 2. Email match for this event, any state — an inactive match is reactivated
 * 3. Phone match for this event, any state — an inactive match is reactivated
 * 4. Create a new subscriber record
 *
 * Does not update name or contact info on match — returns the existing record
 * as-is. The one exception is `active`, which is set back to true when a guest
 * who had unsubscribed comes back; their earlier RSVPs are kept.
 *
 * Step 4 tolerates a concurrent request creating the same guest between our
 * lookup and our insert (a double-tapped "Going", say): the loser's INSERT is
 * a no-op via ON CONFLICT DO NOTHING and it re-reads the winner's row instead
 * of throwing. A CHECK violation (no email AND no phone) is still fatal — that
 * is a caller bug, not a race.
 *
 * Takes `db` as its first parameter because D1 is a per-request binding and
 * there is no singleton to import (ADR-006). This restores the signature
 * tasks.md T039 originally specified.
 */
export async function resolveSubscriber(
	db: Db,
	eventId: string,
	cookieUUID: string | undefined,
	name: string,
	email: string | null,
	phone: string | null
): Promise<Subscriber> {
	// Step 1: cookie UUID match. Active only — an unsubscribed guest's cookie
	// entry is removed by the unsubscribe action, and one that lingers must not
	// silently resurrect them.
	if (cookieUUID) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(
				and(
					eq(subscribers.id, cookieUUID),
					eq(subscribers.event_id, eventId),
					eq(subscribers.active, true)
				)
			);
		if (sub) return sub;
	}

	// Steps 2-3: email, then phone
	const existing = await findByContact(db, eventId, email, phone);
	if (existing) return reactivate(db, existing);

	// Step 4: create
	const [created] = await db
		.insert(subscribers)
		.values({ event_id: eventId, name, email, phone })
		.onConflictDoNothing()
		.returning();
	if (created) return created;

	// The insert was a no-op, so a concurrent request created this guest first.
	const raced = await findByContact(db, eventId, email, phone);
	if (raced) return reactivate(db, raced);

	// Unreachable in practice: a conflict implies a matching row exists.
	throw new Error('resolveSubscriber: insert conflicted but no matching subscriber was found');
}
