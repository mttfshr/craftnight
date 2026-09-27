import { error } from '@sveltejs/kit';
import { withDescriptionHtml } from '$lib/server/markdown';
import { events, instances, subscribers, rsvps } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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
