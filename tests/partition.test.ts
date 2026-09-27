import { describe, expect, it } from 'vitest';
import { partitionInstances } from '$lib/utils/instances';

const inst = (id: string, date: string, status: string) => ({ id, date, status });
const ids = (list: { id: string }[]) => list.map((i) => i.id);

const TODAY = '2026-10-14';

describe('partitionInstances', () => {
	it('puts confirmed instances in upcoming (today or later) or past (before today)', () => {
		const result = partitionInstances(
			[
				inst('yesterday', '2026-10-13', 'confirmed'),
				inst('today', '2026-10-14', 'confirmed'),
				inst('tomorrow', '2026-10-15', 'confirmed')
			],
			TODAY
		);
		expect(ids(result.past)).toEqual(['yesterday']);
		expect(ids(result.upcoming)).toEqual(['today', 'tomorrow']); // today is still upcoming
		expect(result.proposed).toEqual([]);
	});

	it('never lets a CANCELLED instance into any section (FR-053)', () => {
		const result = partitionInstances(
			[
				inst('c-past', '2026-01-01', 'cancelled'),
				inst('c-today', '2026-10-14', 'cancelled'),
				inst('c-future', '2026-12-01', 'cancelled'),
				inst('ok', '2026-12-02', 'confirmed')
			],
			TODAY
		);
		const everything = [...result.proposed, ...result.upcoming, ...result.past];
		expect(ids(everything)).toEqual(['ok']);
	});

	it('keeps proposed candidates out of upcoming and past (FR-055)', () => {
		const result = partitionInstances(
			[
				inst('p-future', '2026-12-01', 'proposed'),
				inst('c-future', '2026-12-02', 'confirmed')
			],
			TODAY
		);
		expect(ids(result.upcoming)).toEqual(['c-future']);
		expect(ids(result.proposed)).toEqual(['p-future']);
	});

	it('keeps a proposed candidate whose date has PASSED in proposed, not past (spec scenario 8)', () => {
		const result = partitionInstances([inst('stale', '2026-01-01', 'proposed')], TODAY);
		expect(ids(result.proposed)).toEqual(['stale']);
		expect(result.past).toEqual([]);
		expect(result.upcoming).toEqual([]);
	});

	it('sorts proposed and upcoming soonest-first, and past most-recent-first', () => {
		const result = partitionInstances(
			[
				inst('p2', '2026-11-02', 'proposed'),
				inst('p1', '2026-11-01', 'proposed'),
				inst('u2', '2026-12-20', 'confirmed'),
				inst('u1', '2026-12-10', 'confirmed'),
				inst('o1', '2026-05-01', 'confirmed'),
				inst('o2', '2026-08-01', 'confirmed')
			],
			TODAY
		);
		expect(ids(result.proposed)).toEqual(['p1', 'p2']);
		expect(ids(result.upcoming)).toEqual(['u1', 'u2']);
		expect(ids(result.past)).toEqual(['o2', 'o1']);
	});

	it('does not mutate its input', () => {
		const input = [inst('b', '2026-12-02', 'confirmed'), inst('a', '2026-12-01', 'confirmed')];
		const snapshot = structuredClone(input);
		partitionInstances(input, TODAY);
		expect(input).toEqual(snapshot);
	});

	it('handles an empty list', () => {
		expect(partitionInstances([], TODAY)).toEqual({ proposed: [], upcoming: [], past: [] });
	});

	it('every non-cancelled instance lands in exactly one section', () => {
		const all = [
			inst('a', '2026-01-01', 'confirmed'),
			inst('b', '2026-10-14', 'confirmed'),
			inst('c', '2026-12-01', 'confirmed'),
			inst('d', '2026-01-01', 'proposed'),
			inst('e', '2026-12-01', 'proposed'),
			inst('f', '2026-12-01', 'cancelled')
		];
		const r = partitionInstances(all, TODAY);
		const placed = [...r.proposed, ...r.upcoming, ...r.past].map((i) => i.id).sort();
		expect(placed).toEqual(['a', 'b', 'c', 'd', 'e']); // f (cancelled) absent, nothing duplicated
	});
});
