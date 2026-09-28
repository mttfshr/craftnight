import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { instances, rsvps } from '$lib/db/schema';
import { cancelInstance } from '$lib/server/instance-status';
import { confirmInstance } from '$lib/server/polls';
import { loadRsvpTarget } from '$lib/server/rsvp-target';
import { partitionInstances } from '$lib/utils/instances';
import { createTestDb, type TestDb } from './support/db';
import { makeEvent, makeGuest, makeInstance, rsvp, statusOf } from './support/seed';

let t: TestDb;
const LA = 'America/Los_Angeles';
const NOON = new Date('2026-10-14T19:00:00Z');

beforeAll(async () => {
	t = await createTestDb();
});
afterAll(async () => {
	await t.dispose();
});
beforeEach(async () => {
	await t.reset();
});

describe('cancelInstance', () => {
	it('cancels a CONFIRMED date and reports what it was', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'confirmed' });

		expect(await cancelInstance(t.db, event.id, inst.id)).toEqual({
			ok: true,
			cancelledId: inst.id,
			previousStatus: 'confirmed'
		});
		expect(await statusOf(t.db, inst.id)).toBe('cancelled');
	});

	it('cancels a PROPOSED candidate and reports what it was', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'proposed' });

		expect(await cancelInstance(t.db, event.id, inst.id)).toEqual({
			ok: true,
			cancelledId: inst.id,
			previousStatus: 'proposed'
		});
		expect(await statusOf(t.db, inst.id)).toBe('cancelled');
	});

	it('changes only that instance', async () => {
		const event = await makeEvent(t.db);
		const other = await makeEvent(t.db, 'other-event');
		const target = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-11-01' });
		const sibling = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-11-08' });
		const candidate = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-11-15' });
		const elsewhere = await makeInstance(t.db, other.id, { status: 'confirmed' });

		await cancelInstance(t.db, event.id, target.id);

		expect(await statusOf(t.db, sibling.id)).toBe('confirmed');
		expect(await statusOf(t.db, candidate.id)).toBe('proposed');
		expect(await statusOf(t.db, elsewhere.id)).toBe('confirmed');
	});

	it("refuses another event's instance, and changes nothing", async () => {
		const mine = await makeEvent(t.db, 'mine');
		const theirs = await makeEvent(t.db, 'theirs');
		const inst = await makeInstance(t.db, theirs.id, { status: 'confirmed' });

		expect(await cancelInstance(t.db, mine.id, inst.id)).toEqual({ ok: false, reason: 'not_found' });
		expect(await statusOf(t.db, inst.id)).toBe('confirmed');
	});

	it('refuses an unknown id', async () => {
		const event = await makeEvent(t.db);
		expect(await cancelInstance(t.db, event.id, 'no-such-instance')).toEqual({
			ok: false,
			reason: 'not_found'
		});
	});

	it('refuses an already-cancelled date instead of pretending it worked', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'cancelled' });

		expect(await cancelInstance(t.db, event.id, inst.id)).toEqual({
			ok: false,
			reason: 'already_cancelled'
		});
	});

	it('a second cancel of the same date is refused, not repeated', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'confirmed' });

		expect((await cancelInstance(t.db, event.id, inst.id)).ok).toBe(true);
		expect(await cancelInstance(t.db, event.id, inst.id)).toEqual({
			ok: false,
			reason: 'already_cancelled'
		});
	});

	it('two SIMULTANEOUS cancels (a double-click) yield exactly one success', async () => {
		// Both calls can read "not cancelled" before either writes. The UPDATE is
		// conditional on status, so only one of them changes a row.
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'confirmed' });

		const results = await Promise.all([
			cancelInstance(t.db, event.id, inst.id),
			cancelInstance(t.db, event.id, inst.id)
		]);

		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'already_cancelled' }]);
		expect(await statusOf(t.db, inst.id)).toBe('cancelled');
	});

	it('a date that has already passed can still be cancelled (the organizer asked for "any date")', async () => {
		const event = await makeEvent(t.db);
		const past = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2020-01-01' });
		const stale = await makeInstance(t.db, event.id, { status: 'proposed', date: '2020-01-02' });

		expect((await cancelInstance(t.db, event.id, past.id)).ok).toBe(true);
		expect((await cancelInstance(t.db, event.id, stale.id)).ok).toBe(true);
	});
});

describe('what a cancelled date means for everyone else', () => {
	it('keeps every RSVP on it (FR-054): the organizer still needs to know who to tell', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'confirmed' });
		const [a, b] = await Promise.all([makeGuest(t.db, event.id), makeGuest(t.db, event.id)]);
		await rsvp(t.db, a.id, inst.id, 'yes');
		await rsvp(t.db, b.id, inst.id, 'maybe');

		await cancelInstance(t.db, event.id, inst.id);

		const kept = await t.db.select().from(rsvps).where(eq(rsvps.instance_id, inst.id));
		expect(kept.map((r) => r.status).sort()).toEqual(['maybe', 'yes']);
	});

	it('guests can no longer RSVP to it, including from a page that was already open', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-12-01' });
		await cancelInstance(t.db, event.id, inst.id);

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.instance).toBeNull();
		expect(result.err).toMatch(/cancelled/i);
	});

	it('it appears in no public section', async () => {
		const event = await makeEvent(t.db);
		const gone = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-12-01' });
		const kept = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-12-08' });
		await cancelInstance(t.db, event.id, gone.id);

		const all = await t.db.select().from(instances).where(eq(instances.event_id, event.id));
		const { proposed, upcoming, past } = partitionInstances(all, '2026-10-14');
		const shown = [...proposed, ...upcoming, ...past].map((i) => i.id);
		expect(shown).toEqual([kept.id]);
	});
});

describe('cancelling inside a date poll', () => {
	it('drops one candidate and leaves the poll running for the others', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-24' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-25' });
		const c = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-26' });

		await cancelInstance(t.db, event.id, a.id);

		expect(await statusOf(t.db, b.id)).toBe('proposed');
		expect(await statusOf(t.db, c.id)).toBe('proposed');
	});

	it('the remaining candidates can still be confirmed, and the cancelled one stays cancelled', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-24' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-25' });
		const c = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-26' });
		await cancelInstance(t.db, event.id, a.id);

		const result = await confirmInstance(t.db, event.id, b.id);

		// Only c was still a live candidate to be cancelled by the confirm.
		expect(result).toEqual({ ok: true, confirmedId: b.id, cancelledIds: [c.id] });
		expect(await statusOf(t.db, a.id)).toBe('cancelled');
	});

	it('a cancelled candidate can no longer be confirmed (no resurrection)', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		await makeInstance(t.db, event.id, { status: 'proposed' });
		await cancelInstance(t.db, event.id, a.id);

		expect(await confirmInstance(t.db, event.id, a.id)).toEqual({ ok: false, reason: 'not_proposed' });
		expect(await statusOf(t.db, a.id)).toBe('cancelled');
	});

	it('cancelling every candidate ends the poll: nothing is left to confirm', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed' });
		await cancelInstance(t.db, event.id, a.id);
		await cancelInstance(t.db, event.id, b.id);

		expect(await confirmInstance(t.db, event.id, a.id)).toMatchObject({ ok: false });
		expect(await confirmInstance(t.db, event.id, b.id)).toMatchObject({ ok: false });
	});
});
