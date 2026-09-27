import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { instances, rsvps } from '$lib/db/schema';
import { confirmInstance, rsvpTallies } from '$lib/server/polls';
import { createTestDb, type TestDb } from './support/db';
import { makeEvent, makeGuest, makeInstance, rsvp, statusOf } from './support/seed';

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

describe('confirmInstance (FR-052)', () => {
	it('confirms the chosen candidate and cancels the other proposed ones', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-24' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-25' });
		const c = await makeInstance(t.db, event.id, { status: 'proposed', date: '2026-10-26' });

		const result = await confirmInstance(t.db, event.id, b.id);

		expect(result).toEqual({ ok: true, confirmedId: b.id, cancelledIds: expect.any(Array) });
		expect(result.ok && result.cancelledIds.sort()).toEqual([a.id, c.id].sort());
		expect(await statusOf(t.db, b.id)).toBe('confirmed');
		expect(await statusOf(t.db, a.id)).toBe('cancelled');
		expect(await statusOf(t.db, c.id)).toBe('cancelled');
	});

	it('works with a single candidate', async () => {
		const event = await makeEvent(t.db);
		const only = await makeInstance(t.db, event.id, { status: 'proposed' });

		const result = await confirmInstance(t.db, event.id, only.id);

		expect(result).toEqual({ ok: true, confirmedId: only.id, cancelledIds: [] });
		expect(await statusOf(t.db, only.id)).toBe('confirmed');
	});

	it('leaves already-confirmed and already-cancelled instances alone', async () => {
		const event = await makeEvent(t.db);
		const regular = await makeInstance(t.db, event.id, { status: 'confirmed', date: '2026-09-30' });
		const old = await makeInstance(t.db, event.id, { status: 'cancelled', date: '2026-09-01' });
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed' });

		await confirmInstance(t.db, event.id, a.id);

		expect(await statusOf(t.db, regular.id)).toBe('confirmed'); // not touched
		expect(await statusOf(t.db, old.id)).toBe('cancelled'); //    not touched
		expect(await statusOf(t.db, a.id)).toBe('confirmed');
		expect(await statusOf(t.db, b.id)).toBe('cancelled');
	});

	it("is scoped to one event: another event's proposed candidates are untouched", async () => {
		const mine = await makeEvent(t.db, 'mine');
		const theirs = await makeEvent(t.db, 'theirs');
		const m1 = await makeInstance(t.db, mine.id, { status: 'proposed' });
		const m2 = await makeInstance(t.db, mine.id, { status: 'proposed' });
		const t1 = await makeInstance(t.db, theirs.id, { status: 'proposed' });
		const t2 = await makeInstance(t.db, theirs.id, { status: 'proposed' });

		await confirmInstance(t.db, mine.id, m1.id);

		expect(await statusOf(t.db, m2.id)).toBe('cancelled');
		expect(await statusOf(t.db, t1.id)).toBe('proposed');
		expect(await statusOf(t.db, t2.id)).toBe('proposed');
	});

	it('rejects an unknown id, and changes nothing', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });

		expect(await confirmInstance(t.db, event.id, 'no-such-instance')).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(await statusOf(t.db, a.id)).toBe('proposed');
	});

	it("rejects an instance from a DIFFERENT event, and changes nothing in either", async () => {
		const mine = await makeEvent(t.db, 'mine');
		const theirs = await makeEvent(t.db, 'theirs');
		const m = await makeInstance(t.db, mine.id, { status: 'proposed' });
		const t1 = await makeInstance(t.db, theirs.id, { status: 'proposed' });

		// Asking to confirm their instance through my event must not work.
		expect(await confirmInstance(t.db, mine.id, t1.id)).toEqual({ ok: false, reason: 'not_found' });
		expect(await statusOf(t.db, m.id)).toBe('proposed');
		expect(await statusOf(t.db, t1.id)).toBe('proposed');
	});

	it.each(['confirmed', 'cancelled'] as const)(
		'refuses to "confirm" a %s instance, and does NOT cancel the live candidates',
		async (status) => {
			// The dangerous case: without this guard, confirming a cancelled
			// candidate would resurrect it while cancelling every live one.
			const event = await makeEvent(t.db);
			const target = await makeInstance(t.db, event.id, { status });
			const live = await makeInstance(t.db, event.id, { status: 'proposed' });

			expect(await confirmInstance(t.db, event.id, target.id)).toEqual({
				ok: false,
				reason: 'not_proposed'
			});
			expect(await statusOf(t.db, target.id)).toBe(status);
			expect(await statusOf(t.db, live.id)).toBe('proposed');
		}
	);

	it('a second confirm of the same candidate is rejected, not repeated', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		await makeInstance(t.db, event.id, { status: 'proposed' });

		expect((await confirmInstance(t.db, event.id, a.id)).ok).toBe(true);
		// A double-clicked button lands here.
		expect(await confirmInstance(t.db, event.id, a.id)).toEqual({
			ok: false,
			reason: 'not_proposed'
		});
	});

	it('keeps the RSVPs on cancelled candidates (FR-054: not deleted)', async () => {
		const event = await makeEvent(t.db);
		const keep = await makeInstance(t.db, event.id, { status: 'proposed' });
		const drop = await makeInstance(t.db, event.id, { status: 'proposed' });
		const guest = await makeGuest(t.db, event.id);
		await rsvp(t.db, guest.id, drop.id, 'yes');

		await confirmInstance(t.db, event.id, keep.id);

		const kept = await t.db.select().from(rsvps).where(eq(rsvps.instance_id, drop.id));
		expect(kept).toHaveLength(1);
		expect(kept[0].status).toBe('yes');
	});

	it('can confirm a candidate whose date has already passed (spec scenario 8)', async () => {
		const event = await makeEvent(t.db);
		const stale = await makeInstance(t.db, event.id, { status: 'proposed', date: '2020-01-01' });

		expect((await confirmInstance(t.db, event.id, stale.id)).ok).toBe(true);
		expect(await statusOf(t.db, stale.id)).toBe('confirmed');
	});
});

describe('D1 batch atomicity — the property confirmInstance relies on', () => {
	// confirmInstance issues two UPDATEs in one db.batch() and treats that as a
	// transaction, because D1 has no interactive transactions. That is a claim
	// about D1, so it is verified here rather than cited: when the SECOND
	// statement fails, the FIRST must be rolled back.
	it('rolls back the whole batch when a later statement fails', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed' });

		const failure = await t.db
			.batch([
				t.db.update(instances).set({ status: 'confirmed' }).where(eq(instances.id, a.id)),
				// 'bogus' violates instances_status_check, so this statement throws
				t.db.update(instances).set({ status: 'bogus' }).where(eq(instances.id, b.id))
			])
			.then(
				() => null,
				(e: unknown) => e
			);

		expect(failure).toBeInstanceOf(Error);
		// The first statement succeeded on its own, but must not have persisted.
		expect(await statusOf(t.db, a.id)).toBe('proposed');
		expect(await statusOf(t.db, b.id)).toBe('proposed');
	});
});

describe('rsvpTallies (FR-051)', () => {
	it('counts yes / maybe / no per instance', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed' });
		const [g1, g2, g3, g4] = await Promise.all([
			makeGuest(t.db, event.id),
			makeGuest(t.db, event.id),
			makeGuest(t.db, event.id),
			makeGuest(t.db, event.id)
		]);
		await rsvp(t.db, g1.id, a.id, 'yes');
		await rsvp(t.db, g2.id, a.id, 'yes');
		await rsvp(t.db, g3.id, a.id, 'maybe');
		await rsvp(t.db, g4.id, a.id, 'no');
		await rsvp(t.db, g1.id, b.id, 'maybe');

		expect(await rsvpTallies(t.db, [a.id, b.id])).toEqual({
			[a.id]: { yes: 2, maybe: 1, no: 1 },
			[b.id]: { yes: 0, maybe: 1, no: 0 }
		});
	});

	it('gives zeros, not a missing key, for a candidate nobody has answered', async () => {
		const event = await makeEvent(t.db);
		const quiet = await makeInstance(t.db, event.id, { status: 'proposed' });

		expect(await rsvpTallies(t.db, [quiet.id])).toEqual({ [quiet.id]: { yes: 0, maybe: 0, no: 0 } });
	});

	it('does not count guests who have unsubscribed (matches the instance dashboard)', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const stayed = await makeGuest(t.db, event.id);
		const left = await makeGuest(t.db, event.id, { active: false });
		await rsvp(t.db, stayed.id, a.id, 'yes');
		await rsvp(t.db, left.id, a.id, 'yes');

		expect((await rsvpTallies(t.db, [a.id]))[a.id]).toEqual({ yes: 1, maybe: 0, no: 0 });
	});

	it('only reports the instances asked for, and handles an empty list', async () => {
		const event = await makeEvent(t.db);
		const a = await makeInstance(t.db, event.id, { status: 'proposed' });
		const b = await makeInstance(t.db, event.id, { status: 'proposed' });
		const g = await makeGuest(t.db, event.id);
		await rsvp(t.db, g.id, a.id, 'yes');
		await rsvp(t.db, g.id, b.id, 'yes');

		expect(Object.keys(await rsvpTallies(t.db, [a.id]))).toEqual([a.id]);
		expect(await rsvpTallies(t.db, [])).toEqual({});
	});
});
