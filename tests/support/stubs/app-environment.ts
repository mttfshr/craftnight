/**
 * Test stand-in for SvelteKit's `$app/environment`.
 *
 * In a real build `dev` is a compile-time constant: `false` in a production
 * bundle, so the auth bypass that depends on it is removed entirely (checked in
 * the built output: `isAuthBypassed(env) { return false; }`). Tests default to
 * that production value. tests/auth-dev.test.ts overrides it with vi.mock to
 * exercise the development branch.
 */
export const dev = false;
