import { error, fail, redirect } from '@sveltejs/kit';
import { events, subscribers } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { readSubscriberCookieMap, writeSubscriberCookieMap } from '$lib/server/auth';
import { isUniqueViolation } from '$lib/server/db-errors';
import { readContact } from '$lib/utils/contact';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.slug, params.slug));
	if (!event) error(404, 'Event not found');

	const subscriberId = locals.subscriberCookie[params.slug];
	if (!subscriberId) redirect(303, `/events/${params.slug}`);

	const [subscriber] = await locals.db
		.select()
		.from(subscribers)
		.where(
			and(
				eq(subscribers.id, subscriberId),
				eq(subscribers.event_id, event.id),
				eq(subscribers.active, true)
			)
		);

	if (!subscriber) redirect(303, `/events/${params.slug}`);

	return { event, subscriber };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const cookieUUID = locals.subscriberCookie[params.slug];
		if (!cookieUUID) return fail(401, { error: 'Not identified.' });

		const [event] = await locals.db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) return fail(404, { error: 'Event not found.' });

		const [subscriber] = await locals.db
			.select()
			.from(subscribers)
			.where(
				and(
					eq(subscribers.id, cookieUUID),
					eq(subscribers.event_id, event.id),
					eq(subscribers.active, true)
				)
			);
		if (!subscriber) return fail(401, { error: 'Subscriber not found.' });

		const form = await request.formData();
		const name = form.get('name');
		const email = form.get('email');
		const phone = form.get('phone');

		if (typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Name is required.' });
		}

		const contact = readContact(email, phone);
		if (contact.error) return fail(400, { error: contact.error });

		try {
			await locals.db
				.update(subscribers)
				.set({ name: name.trim(), email: contact.email, phone: contact.phone })
				.where(eq(subscribers.id, subscriber.id));
		} catch (e) {
			// Changing your own contact to one another guest of this event already
			// uses violates the unique index. Say so instead of returning a 500.
			if (isUniqueViolation(e)) {
				return fail(409, { error: 'Another guest already uses that email or phone number.' });
			}
			throw e;
		}

		return { updated: true };
	},

	unsubscribe: async ({ params, locals, cookies, platform }) => {
		const cookieUUID = locals.subscriberCookie[params.slug];
		if (!cookieUUID) redirect(303, `/events/${params.slug}`);

		const [event] = await locals.db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) redirect(303, `/events/${params.slug}`);

		await locals.db
			.update(subscribers)
			.set({ active: false })
			.where(and(eq(subscribers.id, cookieUUID), eq(subscribers.event_id, event.id)));

		// Remove this slug from the subscriber cookie map
		const secret = platform?.env.SESSION_SECRET;
		const map = await readSubscriberCookieMap(cookies, secret);
		delete map[params.slug];
		await writeSubscriberCookieMap(cookies, secret, map);

		redirect(303, `/events/${params.slug}?unsubscribed=1`);
	}
};
