import { describe, expect, it } from 'vitest';
import { isPast, isUpcoming, nextDay, todayIn, zonedTimeToUtc } from '$lib/utils/dates';

const LA = 'America/Los_Angeles';
const at = (iso: string) => new Date(iso);

describe('todayIn', () => {
	it("is the Event's local date, not the runtime's (UTC) date", () => {
		// 01:30 UTC on Oct 15 is 18:30 on Oct 14 in Los Angeles.
		expect(todayIn(LA, at('2026-10-15T01:30:00Z'))).toBe('2026-10-14');
		expect(todayIn('UTC', at('2026-10-15T01:30:00Z'))).toBe('2026-10-15');
	});

	it('gives different answers for different zones at the same instant', () => {
		const instant = at('2026-06-01T03:00:00Z');
		expect(todayIn('Pacific/Auckland', instant)).toBe('2026-06-01'); // 15:00 NZST
		expect(todayIn(LA, instant)).toBe('2026-05-31'); //               20:00 PDT
	});

	it('zero-pads month and day', () => {
		expect(todayIn(LA, at('2026-01-05T20:00:00Z'))).toBe('2026-01-05');
	});

	it('throws on an unknown zone instead of quietly using the wrong day', () => {
		expect(() => todayIn('Not/AZone', at('2026-01-01T00:00:00Z'))).toThrow(RangeError);
	});
});

describe('isPast / isUpcoming — the midnight lock (FR-020)', () => {
	// Each row: now, event date, expected isPast. The rows marked OLD are the
	// ones the previous `toISOString().slice(0, 10)` implementation got wrong:
	// it rolled "today" over at 5pm Pacific, so tonight's event locked and moved
	// to Past mid-afternoon.
	it.each([
		['noon on event day', '2026-10-14T19:00:00Z', '2026-10-14', false],
		['OLD: 6:30pm on event day', '2026-10-15T01:30:00Z', '2026-10-14', false],
		['OLD: 11:59pm on event day', '2026-10-15T06:59:00Z', '2026-10-14', false],
		['midnight ends the event day', '2026-10-15T07:00:00Z', '2026-10-14', true],
		['the day before', '2026-10-13T19:00:00Z', '2026-10-14', false],
		['a week later', '2026-10-21T19:00:00Z', '2026-10-14', true]
	])('%s', (_label, now, eventDate, expectedPast) => {
		expect(isPast(eventDate, LA, at(now))).toBe(expectedPast);
		expect(isUpcoming(eventDate, LA, at(now))).toBe(!expectedPast);
	});

	it('holds across the fall-back DST transition (PDT to PST, Nov 1 2026)', () => {
		expect(isPast('2026-11-01', LA, at('2026-11-02T07:30:00Z'))).toBe(false); // 23:30 PST
		expect(isPast('2026-11-01', LA, at('2026-11-02T08:00:00Z'))).toBe(true); //  00:00 PST
	});

	it('holds across the spring-forward DST transition (PST to PDT, Mar 8 2026)', () => {
		expect(isPast('2026-03-08', LA, at('2026-03-09T06:30:00Z'))).toBe(false); // 23:30 PDT
		expect(isPast('2026-03-08', LA, at('2026-03-09T07:00:00Z'))).toBe(true); //  00:00 PDT
	});
});

describe('zonedTimeToUtc', () => {
	const iso = (date: string, time: string, zone: string) =>
		zonedTimeToUtc(date, time, zone).toISOString();

	it.each([
		['PDT evening (UTC-7)', '2026-10-14', '18:00', LA, '2026-10-15T01:00:00.000Z'],
		['PST evening (UTC-8), after fall-back', '2026-11-01', '18:00', LA, '2026-11-02T02:00:00.000Z'],
		['PDT evening, after spring-forward', '2026-03-08', '18:00', LA, '2026-03-09T01:00:00.000Z'],
		['PST, before spring-forward', '2026-03-08', '01:30', LA, '2026-03-08T09:30:00.000Z'],
		['PDT, just after spring-forward', '2026-03-08', '03:30', LA, '2026-03-08T10:30:00.000Z'],
		['UTC is the identity', '2026-06-01', '12:00', 'UTC', '2026-06-01T12:00:00.000Z'],
		['London in summer (UTC+1)', '2026-07-01', '12:00', 'Europe/London', '2026-07-01T11:00:00.000Z'],
		['London in winter (UTC+0)', '2026-01-15', '12:00', 'Europe/London', '2026-01-15T12:00:00.000Z'],
		['Kolkata (UTC+5:30, no DST)', '2026-01-01', '12:00', 'Asia/Kolkata', '2026-01-01T06:30:00.000Z'],
		['midnight is 00:00, not 24:00', '2026-10-14', '00:00', LA, '2026-10-14T07:00:00.000Z']
	])('%s', (_label, date, time, zone, expected) => {
		expect(iso(date, time, zone)).toBe(expected);
	});

	it('resolves a wall time that happens twice (fall back) to the first occurrence', () => {
		// 01:30 on Nov 1 2026 in LA occurs as 08:30Z (PDT) and again as 09:30Z (PST).
		expect(iso('2026-11-01', '01:30', LA)).toBe('2026-11-01T08:30:00.000Z');
	});

	it('does not throw for a wall time that never happens (spring-forward gap)', () => {
		// 02:30 on Mar 8 2026 in LA doesn't exist. The result is only required to
		// be deterministic and within an hour of where it was asked.
		const result = zonedTimeToUtc('2026-03-08', '02:30', LA).getTime();
		const asked = Date.UTC(2026, 2, 8, 10, 30); // 02:30 PST would have been 10:30Z
		expect(Math.abs(result - asked)).toBeLessThanOrEqual(60 * 60 * 1000);
	});

	it('round-trips: the instant, viewed back in the zone, reads the requested wall time', () => {
		for (const [date, time] of [
			['2026-07-04', '19:00'],
			['2026-12-25', '08:15'],
			['2026-11-01', '18:00']
		]) {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: LA,
				hourCycle: 'h23',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			}).formatToParts(zonedTimeToUtc(date, time, LA));
			const get = (t: string) => parts.find((p) => p.type === t)!.value;
			expect(`${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`).toBe(
				`${date} ${time}`
			);
		}
	});
});

describe('nextDay', () => {
	it.each([
		['2026-10-14', '2026-10-15'],
		['2026-10-31', '2026-11-01'],
		['2026-12-31', '2027-01-01'],
		['2028-02-28', '2028-02-29'], // leap year
		['2026-02-28', '2026-03-01']
	])('%s -> %s', (from, to) => {
		expect(nextDay(from)).toBe(to);
	});
});
