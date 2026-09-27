import { events, instances } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { withDescriptionHtml } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.id, params.id));

	if (!event) error(404, 'Event not found');

	const eventInstances = await locals.db
		.select()
		.from(instances)
		.where(eq(instances.event_id, params.id))
		.orderBy(desc(instances.date));

	return { event: withDescriptionHtml(event), instances: eventInstances };
};
