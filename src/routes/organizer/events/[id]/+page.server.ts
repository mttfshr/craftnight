import { events, instances } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { withDescriptionHtml } from '$lib/server/markdown';
import { confirmInstance, rsvpTallies } from '$lib/server/polls';
import { cancelInstance } from '$lib/server/instance-status';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.id, params.id));

	if (!event) error(404, 'Event not found');

	const all = await locals.db
		.select()
		.from(instances)
		.where(eq(instances.event_id, params.id))
		.orderBy(desc(instances.date));

	// Candidates read best soonest-first, so they can be compared like a poll.
	const proposed = all
		.filter((i) => i.status === 'proposed')
		.sort((a, b) => a.date.localeCompare(b.date));

	// Everything else stays newest-first. Cancelled instances are kept and shown,
	// labelled, rather than hidden (FR-054).
	const rest = all.filter((i) => i.status !== 'proposed');

	const tallies = await rsvpTallies(
		locals.db,
		proposed.map((i) => i.id)
	);

	return {
		event: withDescriptionHtml(event),
		proposed: proposed.map((i) => ({ ...i, tally: tallies[i.id] })),
		instances: rest
	};
};

export const actions: Actions = {
	// "Confirm this date" (FR-052). All the rules live in confirmInstance: it
	// validates that the target is a proposed instance of THIS event, then
	// confirms it and cancels its siblings atomically.
	confirmInstance: async ({ request, params, locals }) => {
		const form = await request.formData();
		const instanceId = form.get('instanceId');
		if (typeof instanceId !== 'string' || !instanceId) {
			return fail(400, { confirmError: 'No date was selected.' });
		}

		const result = await confirmInstance(locals.db, params.id, instanceId);
		if (!result.ok) {
			return result.reason === 'not_found'
				? fail(404, { confirmError: 'That date no longer exists.' })
				: fail(409, {
						confirmError:
							'That date is no longer a proposed candidate — it may already have been confirmed. Reload to see the current state.'
					});
		}

		return { confirmedId: result.confirmedId, cancelledCount: result.cancelledIds.length };
	},

	// "Cancel" on a date-poll candidate. Cancelling one candidate leaves the rest
	// of the poll running; all the rules live in cancelInstance.
	cancelInstance: async ({ request, params, locals }) => {
		const form = await request.formData();
		const instanceId = form.get('instanceId');
		if (typeof instanceId !== 'string' || !instanceId) {
			return fail(400, { cancelError: 'No date was selected.' });
		}

		const result = await cancelInstance(locals.db, params.id, instanceId);
		if (!result.ok) {
			return result.reason === 'not_found'
				? fail(404, { cancelError: 'That date no longer exists.' })
				: fail(409, { cancelError: 'That date was already cancelled. Reload to see the current state.' });
		}

		return { cancelledId: result.cancelledId };
	}
};
