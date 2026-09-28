import { and, eq, ne } from 'drizzle-orm';
import { instances } from '$lib/db/schema';
import type { Db } from '$lib/db';

export type CancelResult =
	| { ok: true; cancelledId: string; previousStatus: 'proposed' | 'confirmed' }
	| { ok: false; reason: 'not_found' | 'already_cancelled' };

/**
 * Cancels one instance: any date that is not already cancelled, whether it was
 * a confirmed date or a proposed candidate. Final — like confirming a poll date
 * there is no restore, which is why the UI asks first.
 *
 * What cancelling does and does not do:
 *   - RSVPs are KEPT (FR-054). The organizer texts guests by hand, so who said
 *     yes is exactly what they need after a cancellation.
 *   - The date drops out of every public section and its calendar file starts
 *     returning 404 (FR-053); a guest with the page still open is refused with
 *     "This date was cancelled" (loadRsvpTarget). None of that needs code here —
 *     it all keys off `status`.
 *   - Nothing is SENT. The app has no notification channel (ADR-001), and a
 *     calendar file a guest already downloaded cannot be recalled.
 *   - Other instances are untouched. Cancelling one candidate leaves the rest of
 *     a date poll running.
 *
 * The event check matters: without it, an id belonging to another Event could be
 * cancelled through this one. "Already cancelled" is decided in exactly one
 * place, the UPDATE itself, which is conditional on the status not being
 * `cancelled`. That covers the double-clicked button (both requests can read
 * "not cancelled" before either writes) and the plain repeat, through the same
 * path, so there is no second check to drift out of step with the first.
 */
export async function cancelInstance(
	db: Db,
	eventId: string,
	instanceId: string
): Promise<CancelResult> {
	const [target] = await db
		.select()
		.from(instances)
		.where(and(eq(instances.id, instanceId), eq(instances.event_id, eventId)));
	if (!target) return { ok: false, reason: 'not_found' };

	const updated = await db
		.update(instances)
		.set({ status: 'cancelled' })
		.where(
			and(
				eq(instances.id, instanceId),
				eq(instances.event_id, eventId),
				ne(instances.status, 'cancelled')
			)
		)
		.returning({ id: instances.id });

	// Zero rows: it was already cancelled, whether long ago or a moment ago.
	if (updated.length === 0) return { ok: false, reason: 'already_cancelled' };

	return {
		ok: true,
		cancelledId: instanceId,
		previousStatus: target.status as 'proposed' | 'confirmed'
	};
}
