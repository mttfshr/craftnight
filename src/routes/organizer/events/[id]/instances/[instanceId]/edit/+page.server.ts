import { fail, redirect, error } from '@sveltejs/kit';
import { events, instances } from '$lib/db/schema';
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

	return { event, instance };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const form = await request.formData();

		const date = form.get('date');
		const start_time = form.get('start_time');
		const end_time = form.get('end_time');
		const location = form.get('location');
		const description = form.get('description');

		if (typeof date !== 'string' || !date) return fail(400, { error: 'Date is required.' });
		if (typeof start_time !== 'string' || !start_time) return fail(400, { error: 'Start time is required.' });
		if (typeof end_time !== 'string' || !end_time) return fail(400, { error: 'End time is required.' });

		// Stored as markdown source and escaped at render time, so nothing to sanitize (ADR-007).
		const storedDescription = typeof description === 'string' && description.trim() ? description.trim() : null;

		await locals.db
			.update(instances)
			.set({
				date,
				start_time,
				end_time,
				location: typeof location === 'string' && location.trim() ? location.trim() : null,
				description: storedDescription
			})
			.where(and(eq(instances.id, params.instanceId), eq(instances.event_id, params.id)));

		redirect(303, `/organizer/events/${params.id}/instances/${params.instanceId}`);
	}
};
