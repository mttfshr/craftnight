import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * D1 arrives as a per-request binding, so there is no module-level singleton
 * to import. `hooks.server.ts` calls this once per request and puts the result
 * on `locals.db`; route files take it from there.
 *
 * Do not reintroduce a module-scoped `db` export. See ADR-006.
 */
export function makeDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof makeDb>;
