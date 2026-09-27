import { error, fail, redirect } from '@sveltejs/kit';
import { events, instances, subscribers, rsvps } from '$lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { isPast } from '$lib/utils/dates';
import { toPlainText, withDescriptionHtml } from '$lib/server/markdown';
import { validateTurnstileToken } from '$lib/server/turnstile';
import { resolveSubscriber } from '$lib/server/subscribers';
import { readSubscriberCookieMap, writeSubscriberCookieMap } from '$lib/server/auth';
import type { PageServerLoad, Actions } from './$types';
import type { Db } from '$lib/db';
import type { Rsvp } from '$lib/db/schema';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = locals.db;

	const [event] = await db.select().from(events).where(eq(events.slug, params.slug));
	if (!event) error(404, 'Event not found');

	const today = new Date().toISOString().slice(0, 10);

	const allInstances = await db
		.select()
		.from(instances)
		.where(eq(instances.event_id, event.id))
		.orderBy(asc(instances.date));

	// Descriptions render to HTML here, on the server, so micromark never ships
	// to the browser. Past instances show no description (FR-043), so only
	// upcoming ones are rendered.
	const upcomingInstances = allInstances
		.filter((i) => i.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((i) => withDescriptionHtml(i));

	const pastInstances = allInstances
		.filter((i) => i.date < today)
		.sort((a, b) => b.date.localeCompare(a.date)); // most recent first

	// Resolve visitor identity from cookie
	let subscriber = null;
	const rsvpsByInstance: Record<string, Rsvp> = {};

	const cookieUUID = locals.subscriberCookie[params.slug];
	if (cookieUUID) {
		const [sub] = await db
			.select()
			.from(subscribers)
			.where(
				and(
					eq(subscribers.id, cookieUUID),
					eq(subscribers.event_id, event.id),
					eq(subscribers.active, true)
				)
			);

		if (sub) {
			subscriber = sub;

			// One query for all RSVPs across all instances
			const allInstanceIds = allInstances.map((i) => i.id);
			if (allInstanceIds.length > 0) {
				const visitorRsvps = await db
					.select()
					.from(rsvps)
					.where(
						and(eq(rsvps.subscriber_id, sub.id), inArray(rsvps.instance_id, allInstanceIds))
					);

				// Key by instance_id for O(1) lookup in template
				for (const rsvp of visitorRsvps) {
					rsvpsByInstance[rsvp.instance_id] = rsvp;
				}
			}
		}
	}

	return {
		event: withDescriptionHtml(event),
		// Plain-text forms for <meta>, og:description and JSON-LD (FR-036, T113).
		// Raw markdown source in a meta tag would show up as literal asterisks.
		descriptionText: toPlainText(event.description),
		metaDescription: toPlainText(event.description, { singleLine: true, maxLength: 200 }),
		subscriber,
		upcomingInstances,
		pastInstances,
		rsvpsByInstance,
		// PUBLIC_TURNSTILE_SITE_KEY lives in wrangler.jsonc `vars` (a runtime
		// binding via platform.env), not in a .env file, so $env/static/public
		// can't see it — that module is populated at build time from Vite env
		// files. Passed through page data instead, which also keeps the site
		// key in exactly one place rather than two files that could drift.
		turnstileSiteKey: platform?.env.PUBLIC_TURNSTILE_SITE_KEY ?? ''
	};
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['yes', 'maybe', 'no'] as const;
type RsvpStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(s: unknown): s is RsvpStatus {
	return VALID_STATUSES.includes(s as RsvpStatus);
}

async function upsertRsvp(db: Db, subscriberId: string, instanceId: string, status: RsvpStatus) {
	const now = new Date();
	await db
		.insert(rsvps)
		.values({ subscriber_id: subscriberId, instance_id: instanceId, status, updated_at: now })
		.onConflictDoUpdate({
			target: [rsvps.subscriber_id, rsvps.instance_id],
			// D1 has no now() — the timestamp is supplied by the app (ADR-006).
			set: { status, updated_at: now }
		});
}

/** Look up and validate an instance belongs to the given event and is not past. */
async function loadAndValidateInstance(db: Db, instanceId: unknown, eventId: string) {
	if (typeof instanceId !== 'string' || !instanceId) {
		return { instance: null, err: 'No instance specified.' };
	}
	const [instance] = await db
		.select()
		.from(instances)
		.where(and(eq(instances.id, instanceId), eq(instances.event_id, eventId)));
	if (!instance) return { instance: null, err: 'Instance not found.' };
	if (isPast(instance.date)) return { instance: null, err: 'This event has already passed.' };
	return { instance, err: null };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {
	// First-time guest: subscribe + RSVP for a specific instance
	subscribe: async ({ request, params, cookies, locals, platform, getClientAddress }) => {
		const db = locals.db;
		const form = await request.formData();

		// Turnstile is REQUIRED on this action, not "validated if present"
		// (FR-057). The old code only checked a token when one was submitted,
		// which meant omitting the field skipped the check entirely. Every
		// first-time form therefore carries its own widget — see FR-045, amended
		// 2026-09-27.
		const token = form.get('cf-turnstile-response');
		const verified = await validateTurnstileToken(
			typeof token === 'string' ? token : '',
			platform?.env.CLOUDFLARE_TURNSTILE_SECRET,
			getClientAddress()
		);
		if (!verified) {
			return fail(400, { error: 'Human verification failed. Please try again.' });
		}

		// Load event
		const [event] = await db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) return fail(404, { error: 'Event not found.' });

		// Validate instance
		const { instance, err: instanceErr } = await loadAndValidateInstance(
			db,
			form.get('instanceId'),
			event.id
		);
		if (!instance) return fail(400, { error: instanceErr! });

		// Validate subscriber fields
		const name = form.get('name');
		const email = form.get('email');
		const phone = form.get('phone');
		const status = form.get('rsvp');

		if (typeof name !== 'string' || !name.trim()) {
			return fail(400, { subscribeError: 'Name is required.', instanceId: instance.id });
		}
		const emailVal = typeof email === 'string' && email.trim() ? email.trim() : null;
		const phoneVal = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
		if (!emailVal && !phoneVal) {
			return fail(400, {
				subscribeError: 'Email or phone number is required.',
				instanceId: instance.id
			});
		}
		if (!isValidStatus(status)) {
			return fail(400, {
				subscribeError: 'Please select an RSVP status.',
				instanceId: instance.id
			});
		}

		// Resolve identity + upsert RSVP
		const cookieUUID = locals.subscriberCookie[params.slug];
		const subscriber = await resolveSubscriber(
			db,
			event.id,
			cookieUUID,
			name.trim(),
			emailVal,
			phoneVal
		);
		await upsertRsvp(db, subscriber.id, instance.id, status);

		// Set subscriber cookie
		const secret = platform?.env.SESSION_SECRET;
		const map = await readSubscriberCookieMap(cookies, secret);
		map[params.slug] = subscriber.id;
		await writeSubscriberCookieMap(cookies, secret, map);

		redirect(303, `/events/${params.slug}`);
	},

	// Returning guest: change RSVP for a specific instance
	rsvp: async ({ request, params, locals }) => {
		const db = locals.db;
		const form = await request.formData();
		const status = form.get('rsvp');

		if (!isValidStatus(status)) {
			return fail(400, { error: 'Please select a valid RSVP status.' });
		}

		const cookieUUID = locals.subscriberCookie[params.slug];
		if (!cookieUUID) return fail(401, { error: 'Not identified. Please subscribe first.' });

		// Load event
		const [event] = await db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) return fail(404, { error: 'Event not found.' });

		// Validate instance
		const { instance, err: instanceErr } = await loadAndValidateInstance(
			db,
			form.get('instanceId'),
			event.id
		);
		if (!instance) return fail(400, { error: instanceErr! });

		// Verify subscriber identity. The cookie is HMAC-signed, so this is a
		// liveness check (deleted/deactivated record) rather than a trust check.
		const [subscriber] = await db
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

		await upsertRsvp(db, subscriber.id, instance.id, status);

		redirect(303, `/events/${params.slug}`);
	}
};
