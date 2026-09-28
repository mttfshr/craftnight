import { error, redirect } from '@sveltejs/kit';
import { withDescriptionHtml } from '$lib/server/markdown';
import { cancelInstance } from '$lib/server/instance-status';
import { events, instances, subscribers, rsvps } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.id, params.id));
	if (!event) error(404, 'Event not found');

	const [instance] = await locals.db
		.select()
		.from(instances)
		.where(and(eq(instances.id, params.instanceId), eq(instances.event_id, params.id)));
	if (!instance) error(404, 'Instance not found');

	const subscriberList = await locals.db
		.select({
			id: subscribers.id,
			name: subscribers.name,
			email: subscribers.email,
			phone: subscribers.phone,
			rsvpStatus: rsvps.status
		})
		.from(subscribers)
		.leftJoin(
			rsvps,
			and(eq(rsvps.subscriber_id, subscribers.id), eq(rsvps.instance_id, params.instanceId))
		)
		.where(and(eq(subscribers.event_id, params.id), eq(subscribers.active, true)));

	const yes = subscriberList.filter((s) => s.rsvpStatus === 'yes').length;
	const maybe = subscriberList.filter((s) => s.rsvpStatus === 'maybe').length;
	const no = subscriberList.filter((s) => s.rsvpStatus === 'no').length;
	const noResponse = subscriberList.filter((s) => !s.rsvpStatus).length;

	return {
		event,
		instance: withDescriptionHtml(instance),
		rsvpCounts: { yes, maybe, no, noResponse },
		subscribers: subscriberList
	};
};

export const actions: Actions = {
	// "Cancel this date". Redirects back to the SAME page rather than away, so the
	// organizer lands on the cancelled dashboard with the going/maybe phone list
	// still on it, ready to text everyone. A repeat (double-click, second tab) is
	// harmless: the second call finds it already cancelled and the redirect still
	// shows the right state, so only a genuinely missing date is an error.
	cancel: async ({ params, locals }) => {
		const result = await cancelInstance(locals.db, params.id, params.instanceId);
		if (!result.ok && result.reason === 'not_found') error(404, 'Instance not found');

		redirect(303, `/organizer/events/${params.id}/instances/${params.instanceId}`);
	}
};
