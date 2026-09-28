import { describe, expect, it, vi } from 'vitest';
import { isOrganizerSessionValid, setOrganizerSession, type Cookies } from '$lib/server/auth';

// The development build: `dev` is true. In a production bundle it is a
// compile-time false and the branch under test is removed entirely (see
// auth.test.ts, and the compiled `isAuthBypassed(env) { return false; }`).
vi.mock('$app/environment', () => ({ dev: true }));

function emptyCookies(): Cookies {
	return { set: () => {}, get: () => undefined, delete: () => {} };
}

const envWith = (extra: Record<string, unknown>) => extra as unknown as App.Platform['env'];

describe('the dev bypass in a DEVELOPMENT build (dev = true)', () => {
	it('lets the organizer in with no cookie when the flag is exactly "true"', async () => {
		const env = envWith({ DANGEROUSLY_DISABLE_ORGANIZER_AUTH: 'true' });
		expect(await isOrganizerSessionValid(emptyCookies(), env)).toBe(true);
	});

	it('works even before any secret has been configured (fresh clone, no .dev.vars)', async () => {
		const env = envWith({ DANGEROUSLY_DISABLE_ORGANIZER_AUTH: 'true', SESSION_SECRET: undefined });
		expect(await isOrganizerSessionValid(emptyCookies(), env)).toBe(true);
	});

	it('is NOT on when the flag is absent', async () => {
		const env = envWith({ SESSION_SECRET: 'x' });
		expect(await isOrganizerSessionValid(emptyCookies(), env)).toBe(false);
	});

	// Anything but the exact string is treated as "not set": a typo or a
	// different truthy spelling must leave authentication ENFORCED.
	it.each(['TRUE', 'True', '1', 'yes', 'on', 'true ', ' true', 'truee', '', 'false', 'undefined'])(
		'is NOT on when the flag is %j',
		async (value) => {
			const env = envWith({ DANGEROUSLY_DISABLE_ORGANIZER_AUTH: value, SESSION_SECRET: 'x' });
			expect(await isOrganizerSessionValid(emptyCookies(), env)).toBe(false);
		}
	);

	it('does not weaken anything else: a session still cannot be created without a secret', async () => {
		const env = envWith({ DANGEROUSLY_DISABLE_ORGANIZER_AUTH: 'true' });
		expect(await setOrganizerSession(emptyCookies(), env)).toBe(false);
	});
});
