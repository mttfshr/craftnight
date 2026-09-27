import { defineConfig } from 'drizzle-kit';

/**
 * Generate-only. We do NOT use drizzle-kit's `d1-http` driver or `push`.
 *
 * `npx drizzle-kit generate` writes plain SQL into drizzle/migrations/, and
 * `npx wrangler d1 migrations apply craftnight [--remote]` applies it. That
 * keeps migration state owned by D1 itself and means no Cloudflare API token
 * is needed in local config. See ADR-006.
 */
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/db/schema.ts',
	out: './drizzle/migrations',
	verbose: true,
	strict: true
});
