import { error } from '@sveltejs/kit';
import { events, instances } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildICS } from '$lib/utils/ics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.slug, params.slug));
	if (!event) error(404, 'Event not found');

	const [instance] = await locals.db
		.select()
		.from(instances)
		.where(and(eq(instances.id, params.instanceId), eq(instances.event_id, event.id)));
	if (!instance) error(404, 'Instance not found');

	const ics = buildICS(event, instance);

	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar',
			'Content-Disposition': 'attachment; filename="event.ics"',
			'Cache-Control': 'no-cache'
		}
	});
};
