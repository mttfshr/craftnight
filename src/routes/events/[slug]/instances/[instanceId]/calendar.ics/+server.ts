import { error } from '@sveltejs/kit';
import { events, instances } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildICS } from '$lib/utils/ics';
import { toPlainText } from '$lib/server/markdown';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.slug, params.slug));
	if (!event) error(404, 'Event not found');

	const [instance] = await locals.db
		.select()
		.from(instances)
		.where(and(eq(instances.id, params.instanceId), eq(instances.event_id, event.id)));
	if (!instance) error(404, 'Instance not found');

	// Only a confirmed date is calendar-worthy (FR-053, T085). A cancelled one
	// must not be downloadable, and a proposed one is tentative — the card hides
	// its link, and this makes the endpoint agree instead of relying on nobody
	// knowing the URL. The route takes the id straight from the path, so the
	// earlier note that it was "keyed off upcomingInstances[0]" was wrong.
	// 404, not 403: don't confirm that a cancelled date ever existed.
	if (instance.status !== 'confirmed') error(404, 'Instance not found');

	// Per-occurrence text (what to bring, the agenda) leads; the series
	// description follows. Both are markdown source, so both go through
	// toPlainText — a calendar shows description text literally.
	const description =
		[toPlainText(instance.description), toPlainText(event.description)]
			.filter(Boolean)
			.join('\n\n') || null;

	const ics = buildICS({
		uid: instance.id,
		name: event.name,
		description,
		location: instance.location,
		url: `${url.origin}/events/${event.slug}`,
		date: instance.date,
		startTime: instance.start_time,
		endTime: instance.end_time,
		timeZone: event.timezone
	});

	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': 'attachment; filename="event.ics"',
			'Cache-Control': 'no-cache'
		}
	});
};
