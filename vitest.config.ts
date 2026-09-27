import { defineConfig } from 'vitest/config';

/**
 * Deliberately NOT built on vite.config.ts. That file loads the SvelteKit
 * plugin, whose Cloudflare adapter starts a Miniflare emulator for `vite dev`;
 * tests don't need a dev server and shouldn't inherit one. The only thing
 * app code needs resolved is the `$lib` alias.
 *
 * Tests run in plain Node. Anything that needs a database gets a real
 * in-memory D1 from wrangler's getPlatformProxy (see tests/support/db.ts), so
 * SQLite semantics — NULLs in unique indexes, CHECK constraints — are the
 * production ones rather than a fake's.
 */
export default defineConfig({
	resolve: {
		alias: { $lib: new URL('./src/lib', import.meta.url).pathname }
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		// Booting the workerd-backed D1 takes a moment on first use.
		hookTimeout: 30_000,
		testTimeout: 20_000
	}
});
