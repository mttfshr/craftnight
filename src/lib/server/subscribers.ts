import { subscribers } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Db } from '$lib/db';
import type { Subscriber } from '$lib/db/schema';

/**
 * Resolves a subscriber identity using 4-step priority:
 * 1. Cookie UUID match (exact subscriber already known)
 * 2. Email match on active subscribers for this event
 * 3. Phone match on active subscribers for this event
 * 4. Create new subscriber record
 *
 * Does not update name or contact info on match — returns existing record as-is.
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
	// Step 1: cookie UUID match
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

	// Step 2: email match
	if (email) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(
				and(
					eq(subscribers.email, email),
					eq(subscribers.event_id, eventId),
					eq(subscribers.active, true)
				)
			);
		if (sub) return sub;
	}

	// Step 3: phone match
	if (phone) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(
				and(
					eq(subscribers.phone, phone),
					eq(subscribers.event_id, eventId),
					eq(subscribers.active, true)
				)
			);
		if (sub) return sub;
	}

	// Step 4: create new subscriber
	const [newSub] = await db
		.insert(subscribers)
		.values({ event_id: eventId, name, email, phone })
		.returning();

	return newSub;
}
