import type { Db } from '$lib/db';

/**
 * Bindings come from src/worker-configuration.d.ts (`wrangler types`), so this
 * file doesn't restate them — rerun `npm run cf-types` after editing
 * wrangler.jsonc and new bindings appear automatically.
 *
 * Two deliberate overrides below.
 */
declare global {
	namespace App {
		interface Locals {
			organizer: boolean;
			subscriberCookie: Record<string, string>;
			/** Built per request in hooks.server.ts from platform.env.DB. */
			db: Db;
		}

		interface Platform {
			env: Omit<
				Cloudflare.Env,
				'SESSION_SECRET' | 'ORGANIZER_PASSWORD_HASH' | 'CLOUDFLARE_TURNSTILE_SECRET'
			> & {
				// 1. Secrets are optional, not `string`. Wrangler infers them as
				// always-present because they exist in .dev.vars, but a deploy that
				// forgot `wrangler secret put` hands us undefined at runtime. Typing
				// them optional forces every consumer to handle absence, which is how
				// FR-057's fail-closed behaviour gets enforced by the compiler rather
				// than by remembering.
				SESSION_SECRET?: string;
				ORGANIZER_PASSWORD_HASH?: string;
				CLOUDFLARE_TURNSTILE_SECRET?: string;

				// 2. Not in wrangler.jsonc at all — it's commented out in
				// .dev.vars.example and must never be set in production. Must equal
				// the literal string 'true'; anything else means auth is ENFORCED.
				DANGEROUSLY_DISABLE_ORGANIZER_AUTH?: string;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
