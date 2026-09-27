import { error, fail, redirect } from '@sveltejs/kit';
import { events, instances, subscribers, rsvps } from '$lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { todayIn } from '$lib/utils/dates';
import { partitionInstances } from '$lib/utils/instances';
import { readContact } from '$lib/utils/contact';
import { loadRsvpTarget } from '$lib/server/rsvp-target';
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

	// "Today" is the Event's local date, not the Worker's (UTC) date — otherwise
	// tonight's event moves to Past at 5pm Pacific (FR-020, FR-056).
	const today = todayIn(event.timezone);

	const allInstances = await db
		.select()
		.from(instances)
		.where(eq(instances.event_id, event.id))
		.orderBy(asc(instances.date));

	// Which section each instance belongs in — status AND date — is decided in
	// one tested place (FR-049, FR-053, FR-055). Cancelled ones appear nowhere.
	const { proposed, upcoming, past } = partitionInstances(allInstances, today);

	// Descriptions render to HTML here, on the server, so micromark never ships
	// to the browser. Past instances show no description (FR-043), so only
	// upcoming and proposed ones are rendered.
	const upcomingInstances = upcoming.map((i) => withDescriptionHtml(i));
	const pastInstances = past;

	// A candidate whose date passed without being confirmed or cancelled stays
	// visible, but its RSVPs lock (spec scenario 8). Decided here against the
	// Event's timezone so the card never has to do date maths in the browser.
	const proposedInstances = proposed.map((i) => ({
		...withDescriptionHtml(i),
		locked: i.date < today
	}));

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

			// One query for the visitor's RSVPs across every instance that is
			// actually shown. Cancelled instances are not, so they are not fetched.
			const visibleIds = [...proposed, ...upcoming, ...past].map((i) => i.id);
			if (visibleIds.length > 0) {
				const visitorRsvps = await db
					.select()
					.from(rsvps)
					.where(and(eq(rsvps.subscriber_id, sub.id), inArray(rsvps.instance_id, visibleIds)));

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
		proposedInstances,
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

/*
 * Instance validation for both actions lives in $lib/server/rsvp-target. It
 * deliberately accepts `proposed` instances (guests RSVP to every candidate of
 * a date poll, FR-050) and rejects `cancelled` ones — so do not "simplify" it
 * to a bare belongs-to-this-event check, and do not restrict it to `confirmed`.
 */

/**
 * Every action failure carries the instance it was for, and the page shows the
 * message on THAT card (InstanceCard's `error` prop). Before this, nothing on the
 * public page read the action result at all, so a failed Turnstile check, an
 * unreadable phone number, or a date that had just been cancelled all looked
 * like the button doing nothing.
 */
function reject(status: number, error: string, form: FormData) {
	const id = form.get('instanceId');
	return fail(status, { error, instanceId: typeof id === 'string' ? id : null });
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
			return reject(400, 'Human verification failed. Please try again.', form);
		}

		// Load event
		const [event] = await db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) return reject(404, 'Event not found.', form);

		// Validate instance
		const { instance, err: instanceErr } = await loadRsvpTarget(
			db,
			form.get('instanceId'),
			event.id,
			event.timezone
		);
		if (!instance) return reject(400, instanceErr!, form);

		// Validate subscriber fields
		const name = form.get('name');
		const email = form.get('email');
		const phone = form.get('phone');
		const status = form.get('rsvp');

		if (typeof name !== 'string' || !name.trim()) {
			return reject(400, 'Name is required.', form);
		}
		// Normalized on the way in (T117a): equal contacts must be stored equal, or
		// identity matching splits one guest into two. A filled-in field that
		// can't be read is reported as that, not silently dropped.
		const contact = readContact(email, phone);
		if (contact.error) {
			return reject(400, contact.error, form);
		}
		const { email: emailVal, phone: phoneVal } = contact;
		if (!isValidStatus(status)) {
			return reject(400, 'Please select an RSVP status.', form);
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
			return reject(400, 'Please select a valid RSVP status.', form);
		}

		const cookieUUID = locals.subscriberCookie[params.slug];
		if (!cookieUUID) return reject(401, 'Not identified. Please subscribe first.', form);

		// Load event
		const [event] = await db.select().from(events).where(eq(events.slug, params.slug));
		if (!event) return reject(404, 'Event not found.', form);

		// Validate instance
		const { instance, err: instanceErr } = await loadRsvpTarget(
			db,
			form.get('instanceId'),
			event.id,
			event.timezone
		);
		if (!instance) return reject(400, instanceErr!, form);

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
		if (!subscriber) return reject(401, 'Subscriber not found.', form);

		await upsertRsvp(db, subscriber.id, instance.id, status);

		redirect(303, `/events/${params.slug}`);
	}
};
