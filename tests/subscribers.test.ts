import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, subscribers } from '$lib/db/schema';
import { resolveSubscriber } from '$lib/server/subscribers';
import { isUniqueViolation } from '$lib/server/db-errors';
import { createTestDb, type TestDb } from './support/db';

let t: TestDb;

beforeAll(async () => {
	t = await createTestDb();
});
afterAll(async () => {
	await t.dispose();
});
beforeEach(async () => {
	await t.reset();
});

async function makeEvent(slug = 'craft-night') {
	const [event] = await t.db.insert(events).values({ name: slug, slug }).returning();
	return event;
}

async function countSubscribers() {
	return (await t.db.select().from(subscribers)).length;
}

describe('resolveSubscriber — the 4-step identity priority', () => {
	it('creates a new subscriber when nothing matches', async () => {
		const event = await makeEvent();
		const sub = await resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', null);

		expect(sub.name).toBe('Sam');
		expect(sub.email).toBe('sam@x.com');
		expect(sub.active).toBe(true);
		expect(await countSubscribers()).toBe(1);
	});

	it('step 1: a cookie for an active subscriber wins, even if the form data differs', async () => {
		const event = await makeEvent();
		const first = await resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', null);

		const again = await resolveSubscriber(
			t.db,
			event.id,
			first.id,
			'Someone Else',
			'other@x.com',
			'+14155550100'
		);

		expect(again.id).toBe(first.id);
		expect(again.name).toBe('Sam'); // existing record returned as-is, not overwritten
		expect(await countSubscribers()).toBe(1);
	});

	it('step 2: matches an active subscriber by email when there is no cookie', async () => {
		const event = await makeEvent();
		const first = await resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', null);
		const again = await resolveSubscriber(t.db, event.id, undefined, 'Sam R', 'sam@x.com', null);

		expect(again.id).toBe(first.id);
		expect(await countSubscribers()).toBe(1);
	});

	it('step 3: matches by phone when email does not match', async () => {
		const event = await makeEvent();
		const first = await resolveSubscriber(t.db, event.id, undefined, 'Sam', null, '+14155550100');
		const again = await resolveSubscriber(
			t.db,
			event.id,
			undefined,
			'Sam',
			'new@x.com',
			'+14155550100'
		);

		expect(again.id).toBe(first.id);
		expect(await countSubscribers()).toBe(1);
	});

	it('email takes precedence over phone when they point at different guests', async () => {
		const event = await makeEvent();
		const byEmail = await resolveSubscriber(t.db, event.id, undefined, 'A', 'a@x.com', null);
		await resolveSubscriber(t.db, event.id, undefined, 'B', null, '+14155550100');

		const resolved = await resolveSubscriber(
			t.db,
			event.id,
			undefined,
			'?',
			'a@x.com',
			'+14155550100'
		);
		expect(resolved.id).toBe(byEmail.id);
	});

	it('is scoped per event: the same email in another event is a different guest', async () => {
		const a = await makeEvent('event-a');
		const b = await makeEvent('event-b');
		const inA = await resolveSubscriber(t.db, a.id, undefined, 'Sam', 'sam@x.com', null);
		const inB = await resolveSubscriber(t.db, b.id, undefined, 'Sam', 'sam@x.com', null);

		expect(inB.id).not.toBe(inA.id);
		expect(inB.event_id).toBe(b.id);
	});

	it("a cookie from another event's subscriber is ignored, not honoured", async () => {
		const a = await makeEvent('event-a');
		const b = await makeEvent('event-b');
		const inA = await resolveSubscriber(t.db, a.id, undefined, 'Sam', 'sam@x.com', null);

		const inB = await resolveSubscriber(t.db, b.id, inA.id, 'Sam', 'sam@x.com', null);
		expect(inB.event_id).toBe(b.id);
		expect(inB.id).not.toBe(inA.id);
	});

	it('cannot create a guest with neither email nor phone (schema CHECK)', async () => {
		const event = await makeEvent();
		await expect(
			resolveSubscriber(t.db, event.id, undefined, 'Nobody', null, null)
		).rejects.toThrow();
	});
});

describe('resolveSubscriber — unsubscribe then come back (T117b)', () => {
	async function unsubscribe(id: string) {
		await t.db.update(subscribers).set({ active: false }).where(eq(subscribers.id, id));
	}

	it('re-subscribing with the same EMAIL reactivates the guest instead of crashing', async () => {
		const event = await makeEvent();
		const first = await resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', null);
		await unsubscribe(first.id);

		const back = await resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', null);

		expect(back.id).toBe(first.id);
		expect(back.active).toBe(true);
		expect(await countSubscribers()).toBe(1);
	});

	it('re-subscribing with the same PHONE reactivates the guest instead of crashing', async () => {
		const event = await makeEvent();
		const first = await resolveSubscriber(t.db, event.id, undefined, 'Sam', null, '+14155550100');
		await unsubscribe(first.id);

		const back = await resolveSubscriber(t.db, event.id, undefined, 'Sam', null, '+14155550100');

		expect(back.id).toBe(first.id);
		expect(back.active).toBe(true);
		expect(await countSubscribers()).toBe(1);
	});
});

describe('isUniqueViolation', () => {
	// The helper walks `.cause` because drizzle wraps the driver error. That is
	// an assumption about a library's behaviour, so it is checked against a real
	// D1 error here rather than taken on trust.
	it('recognises a real UNIQUE violation as drizzle surfaces it', async () => {
		const event = await makeEvent();
		await t.db.insert(subscribers).values({ event_id: event.id, name: 'A', email: 'a@x.com' });

		const error = await t.db
			.insert(subscribers)
			.values({ event_id: event.id, name: 'B', email: 'a@x.com' })
			.then(
				() => null,
				(e: unknown) => e
			);

		expect(error).toBeInstanceOf(Error);
		// The point of the helper: the text we need is NOT on the error we catch...
		expect((error as Error).message).not.toContain('UNIQUE constraint failed');
		// ...it is on the cause.
		expect(isUniqueViolation(error)).toBe(true);
	});

	it('does not mistake a CHECK violation for a UNIQUE one', async () => {
		const event = await makeEvent();
		const error = await t.db
			.insert(subscribers)
			.values({ event_id: event.id, name: 'Nobody', email: null, phone: null })
			.then(
				() => null,
				(e: unknown) => e
			);

		expect(error).toBeInstanceOf(Error);
		expect(isUniqueViolation(error)).toBe(false);
	});

	it('is false for non-errors and survives a cyclic cause chain', () => {
		expect(isUniqueViolation(undefined)).toBe(false);
		expect(isUniqueViolation('UNIQUE constraint failed')).toBe(false);

		const a = new Error('a');
		const b = new Error('b', { cause: a });
		(a as { cause?: unknown }).cause = b;
		expect(isUniqueViolation(a)).toBe(false); // terminates rather than looping
	});
});

describe('resolveSubscriber — double submit', () => {
	it('two simultaneous first-time submits from one person yield one guest, not a 500', async () => {
		const event = await makeEvent();
		const submit = () =>
			resolveSubscriber(t.db, event.id, undefined, 'Sam', 'sam@x.com', '+14155550100');

		const [one, two] = await Promise.all([submit(), submit()]);

		expect(two.id).toBe(one.id);
		expect(await countSubscribers()).toBe(1);
	});
});
