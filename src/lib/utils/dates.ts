/**
 * Date helpers for instance scheduling.
 * All comparisons are date-only (midnight boundary) using server time.
 * Instance `date` is a string in YYYY-MM-DD format from Drizzle's `date` column.
 */

function todayString(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true if the instance date is strictly in the past (before today).
 */
export function isPast(date: string): boolean {
	return date < todayString();
}

/**
 * Returns true if the instance date is today or in the future.
 */
export function isUpcoming(date: string): boolean {
	return date >= todayString();
}
