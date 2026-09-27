/**
 * True if `error`, or anything in its `cause` chain, is a SQLite UNIQUE
 * constraint violation.
 *
 * Drizzle wraps driver errors in its own "Failed query: ..." error, so the
 * message that says which constraint failed is on `.cause`, not on the error
 * you catch. (tests/subscribers.test.ts checks this against a real D1 error
 * rather than assuming it.) The chain is capped so a cyclic cause can't loop.
 */
export function isUniqueViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
		if (current.message.includes('UNIQUE constraint failed')) return true;
		current = current.cause;
	}
	return false;
}
