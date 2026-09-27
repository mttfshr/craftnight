/**
 * Date-boundary helpers (FR-020, FR-056).
 *
 * Every boundary is evaluated in the EVENT's timezone, never the runtime's.
 * A Worker has no local timezone — its clock is UTC — and the old
 * `new Date().toISOString().slice(0, 10)` therefore rolled "today" over at
 * 5pm Pacific, so an event happening tonight moved to "Past" and locked its
 * RSVPs mid-afternoon.
 *
 * Instance `date` is a `YYYY-MM-DD` string interpreted in the parent Event's
 * `timezone`, and ISO dates order lexically, so comparing strings is enough.
 *
 * Every function takes an optional `now` so tests can pin the clock.
 */

/** Matches the `events.timezone` column default. */
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

// Constructing a DateTimeFormat is comparatively costly and the result is
// pure, so one per zone is kept for the life of the isolate.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		// Throws RangeError for an unknown zone. That is deliberate: a bad zone
		// should fail loudly rather than silently fall back to the wrong day.
		// (Only the column default can currently be stored — there is no UI to
		// change it — so this is a guard against a future edit, not a live path.)
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

/**
 * Today's date as `YYYY-MM-DD` in the given IANA zone.
 *
 * Assembled from `formatToParts` rather than relying on a locale that happens
 * to format as ISO (`en-CA` does today, but that is a CLDR detail, not a
 * guarantee).
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
	const parts = formatterFor(timeZone).formatToParts(now);
	const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** True if `date` is strictly before today in `timeZone`. */
export function isPast(date: string, timeZone: string, now?: Date): boolean {
	return date < todayIn(timeZone, now);
}

/** True if `date` is today or later in `timeZone`. */
export function isUpcoming(date: string, timeZone: string, now?: Date): boolean {
	return date >= todayIn(timeZone, now);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = offsetFormatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			// h23, not hour12:false — the latter renders midnight as "24" in some engines.
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		offsetFormatters.set(timeZone, formatter);
	}
	return formatter;
}

/** `timeZone`'s offset from UTC at an instant, in ms (positive = east of UTC). */
function offsetMs(instant: number, timeZone: string): number {
	const parts = offsetFormatterFor(timeZone).formatToParts(new Date(instant));
	const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
	const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
	return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads `date` `time`
 * (`YYYY-MM-DD`, `HH:MM`).
 *
 * The offset depends on the instant, which is the thing being solved for, so
 * this guesses with the offset at the wall time read as UTC, then corrects once
 * using the offset at that guess. That converges for every wall time that
 * exists exactly once.
 *
 * The two DST edge cases are deterministic rather than exact: a wall time that
 * happens twice (fall back) resolves to the FIRST occurrence, and one that
 * never happens (spring forward) lands within an hour of where it was asked.
 * Both fall in the small hours, which is not when a craft night happens.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi] = time.split(':').map(Number);
	const wall = Date.UTC(y, mo - 1, d, h, mi, 0);

	let utc = wall - offsetMs(wall, timeZone);
	utc = wall - offsetMs(utc, timeZone);
	return new Date(utc);
}

/** The calendar date after `date`, as `YYYY-MM-DD`. */
export function nextDay(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
