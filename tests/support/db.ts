/// <reference types="vite/client" />
import { getPlatformProxy } from 'wrangler';
import { makeDb, type Db } from '$lib/db';

/**
 * A real, empty, in-memory D1 with the project's actual migrations applied.
 *
 * Migration SQL is read through Vite's glob rather than node:fs, which keeps
 * this consistent with the rest of the project: tsconfig sets `types: []`, so
 * node:* is not available to the TypeScript program (NF-006).
 */
const migrations = import.meta.glob('/drizzle/migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export interface TestDb {
	db: Db;
	d1: D1Database;
	/** Empty every table (children first, so foreign keys hold). */
	reset(): Promise<void>;
	dispose(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
	const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>({
		configPath: 'wrangler.jsonc',
		persist: false // in-memory: nothing touches .wrangler/state or your dev data
	});
	const d1 = env.DB;

	// drizzle-kit separates statements with this marker. Each statement is run
	// on its own with prepare().run(): D1's exec() treats every *line* as a
	// statement and would split a multi-line CREATE TABLE.
	for (const [, sql] of Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b))) {
		for (const statement of sql.split('--> statement-breakpoint')) {
			const trimmed = statement.trim();
			if (trimmed) await d1.prepare(trimmed).run();
		}
	}

	return {
		db: makeDb(d1),
		d1,
		reset: async () => {
			await d1.batch(
				['rsvps', 'subscribers', 'instances', 'events'].map((t) => d1.prepare(`DELETE FROM ${t}`))
			);
		},
		dispose
	};
}
