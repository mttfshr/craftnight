import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRsvpTarget } from '$lib/server/rsvp-target';
import { createTestDb, type TestDb } from './support/db';
import { makeEvent, makeInstance } from './support/seed';

let t: TestDb;
const LA = 'America/Los_Angeles';

beforeAll(async () => {
	t = await createTestDb();
});
afterAll(async () => {
	await t.dispose();
});
beforeEach(async () => {
	await t.reset();
});

// Noon Pacific on Oct 14 2026
const NOON = new Date('2026-10-14T19:00:00Z');

describe('loadRsvpTarget — which instances a guest may RSVP to', () => {
	it('accepts a confirmed instance', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2026-12-01', status: 'confirmed' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.err).toBeNull();
		expect(result.instance?.id).toBe(inst.id);
	});

	it('accepts a PROPOSED instance (FR-050: guests RSVP to each candidate)', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2026-12-01', status: 'proposed' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.err).toBeNull();
		expect(result.instance?.id).toBe(inst.id);
	});

	it('rejects a CANCELLED instance, e.g. from a page left open while the organizer confirmed another', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2026-12-01', status: 'cancelled' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.instance).toBeNull();
		expect(result.err).toMatch(/cancelled/i);
	});

	it("rejects another event's instance", async () => {
		const mine = await makeEvent(t.db, 'mine');
		const theirs = await makeEvent(t.db, 'theirs');
		const inst = await makeInstance(t.db, theirs.id, { date: '2026-12-01' });

		const result = await loadRsvpTarget(t.db, inst.id, mine.id, LA, NOON);
		expect(result.instance).toBeNull();
		expect(result.err).toMatch(/not found/i);
	});

	it.each([undefined, null, '', 42, {}, ['x']])('rejects a missing or malformed id: %j', async (bad) => {
		const event = await makeEvent(t.db);
		const result = await loadRsvpTarget(t.db, bad, event.id, LA, NOON);
		expect(result.instance).toBeNull();
		expect(result.err).toBeTruthy();
	});

	it('rejects an unknown id', async () => {
		const event = await makeEvent(t.db);
		const result = await loadRsvpTarget(t.db, 'nope', event.id, LA, NOON);
		expect(result.err).toMatch(/not found/i);
	});
});

describe('loadRsvpTarget — the midnight lock, in the Event timezone (FR-020)', () => {
	it('still accepts tonight at 6:30pm Pacific, which is already tomorrow in UTC', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2026-10-14' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, new Date('2026-10-15T01:30:00Z'));
		expect(result.err).toBeNull();
	});

	it('locks at local midnight', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2026-10-14' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, new Date('2026-10-15T07:00:00Z'));
		expect(result.instance).toBeNull();
		expect(result.err).toMatch(/already passed/i);
	});

	it('locks a PROPOSED candidate whose date passed (spec scenario 8)', async () => {
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2020-01-01', status: 'proposed' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.instance).toBeNull();
		expect(result.err).toMatch(/already passed/i);
	});

	it('reports "cancelled" rather than "passed" when both are true', async () => {
		// A cancelled, past candidate: the more useful message is that it was cancelled.
		const event = await makeEvent(t.db);
		const inst = await makeInstance(t.db, event.id, { date: '2020-01-01', status: 'cancelled' });

		const result = await loadRsvpTarget(t.db, inst.id, event.id, LA, NOON);
		expect(result.err).toMatch(/cancelled/i);
	});
});
