/**
 * Which section of the public page an instance belongs in (FR-042, FR-043,
 * FR-049, FR-053, FR-055).
 *
 * Pure, so the rule can be tested directly. It is the one place that decides
 * visibility, which is why a cancelled candidate can never "leak" into a
 * section: there is no other code path that builds the lists.
 *
 *   proposed   status = proposed, ANY date, soonest first. A stale candidate
 *              (its date passed unconfirmed) stays visible but locked, per
 *              spec scenario 8 — the caller marks it.
 *   upcoming   status = confirmed, today or later, soonest first
 *   past       status = confirmed, before today, most recent first
 *   cancelled  in NO section
 *
 * `today` is `YYYY-MM-DD` in the Event's timezone (see todayIn).
 */
export interface Partitioned<T> {
	proposed: T[];
	upcoming: T[];
	past: T[];
}

export function partitionInstances<T extends { date: string; status: string }>(
	all: T[],
	today: string
): Partitioned<T> {
	const byDateAsc = (a: T, b: T) => a.date.localeCompare(b.date);

	return {
		proposed: all.filter((i) => i.status === 'proposed').sort(byDateAsc),
		upcoming: all.filter((i) => i.status === 'confirmed' && i.date >= today).sort(byDateAsc),
		past: all
			.filter((i) => i.status === 'confirmed' && i.date < today)
			.sort((a, b) => b.date.localeCompare(a.date))
	};
}
