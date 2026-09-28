import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearOrganizerSession,
	isOrganizerSessionValid,
	readSubscriberCookieMap,
	setOrganizerSession,
	writeSubscriberCookieMap,
	type Cookies
} from '$lib/server/auth';

// `dev` is the production value here (false) — see tests/support/stubs.
// The development branch is covered separately in auth-dev.test.ts.

// ─── helpers ────────────────────────────────────────────────────────────────

function fakeCookies() {
	const jar = new Map<string, string>();
	const setCalls: { name: string; value: string; opts: Record<string, unknown> }[] = [];
	const cookies: Cookies = {
		set: (name, value, opts) => {
			jar.set(name, value);
			setCalls.push({ name, value, opts });
		},
		get: (name) => jar.get(name),
		delete: (name) => {
			jar.delete(name);
		}
	};
	return { cookies, jar, setCalls };
}

const envWith = (secret: string | undefined, extra: Record<string, unknown> = {}) =>
	({ SESSION_SECRET: secret, ...extra }) as unknown as App.Platform['env'];

const enc = new TextEncoder();

async function hmacHex(secret: string, value: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64url = (s: string) =>
	btoa(String.fromCharCode(...enc.encode(s)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/** A cookie value with a VALID signature over an arbitrary raw payload string. */
async function signedRaw(secret: string, rawPayload: string) {
	return `${rawPayload}.${await hmacHex(secret, rawPayload)}`;
}
/** ...over the base64url of a JSON value. */
async function signedJson(secret: string, value: unknown) {
	return signedRaw(secret, b64url(JSON.stringify(value)));
}

const SECRET = 'test-secret-for-session-tests';
const HOUR = 60 * 60 * 1000;

afterEach(() => {
	vi.useRealTimers();
});

// ─── organizer session ──────────────────────────────────────────────────────

describe('organizer session — the happy path', () => {
	it('a session that was just set is valid', async () => {
		const { cookies } = fakeCookies();
		expect(await setOrganizerSession(cookies, envWith(SECRET))).toBe(true);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(true);
	});

	it('is set httpOnly, Secure, SameSite=Lax, path=/, for 24 hours', async () => {
		const { cookies, setCalls } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));

		expect(setCalls).toHaveLength(1);
		expect(setCalls[0].name).toBe('craftnight_organizer');
		expect(setCalls[0].opts).toMatchObject({
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 86_400
		});
	});

	it('carries its expiry in the signed payload, as <base64url>.<sha256 hex>', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
		const { cookies, jar } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));

		const [payload, signature] = jar.get('craftnight_organizer')!.split('.');
		expect(signature).toMatch(/^[0-9a-f]{64}$/);
		const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
		expect(decoded).toEqual({ exp: Math.floor(Date.now() / 1000) + 86_400 });
	});

	it('clearOrganizerSession removes it', async () => {
		const { cookies, jar } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));
		clearOrganizerSession(cookies);
		expect(jar.has('craftnight_organizer')).toBe(false);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
	});
});

describe('organizer session — expiry is enforced by the SERVER (NF-002)', () => {
	// The original bug: the signed payload was a constant string, so `maxAge`
	// — a hint to the browser — was the only expiry. A copied cookie stayed
	// valid until SESSION_SECRET was rotated. These pin the fix.
	it('is valid just before 24 hours and invalid from 24 hours on', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const start = new Date('2026-10-01T12:00:00Z').getTime();
		vi.setSystemTime(start);
		const { cookies } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));

		vi.setSystemTime(start + 24 * HOUR - 1_000);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(true);

		vi.setSystemTime(start + 24 * HOUR); // boundary: expiry is exclusive
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);

		vi.setSystemTime(start + 24 * HOUR + 1_000);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
	});

	it('a COPIED cookie value dies on schedule even though the browser still sends it', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const start = new Date('2026-10-01T12:00:00Z').getTime();
		vi.setSystemTime(start);
		const original = fakeCookies();
		await setOrganizerSession(original.cookies, envWith(SECRET));
		const stolen = original.jar.get('craftnight_organizer')!;

		// An attacker replays the value from a different client, two days later.
		vi.setSystemTime(start + 48 * HOUR);
		const attacker = fakeCookies();
		attacker.jar.set('craftnight_organizer', stolen);
		expect(await isOrganizerSessionValid(attacker.cookies, envWith(SECRET))).toBe(false);
	});

	it('an attacker cannot extend a session by editing the expiry', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
		const { cookies, jar } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));
		const [, signature] = jar.get('craftnight_organizer')!.split('.');

		// Far-future expiry, but the ORIGINAL signature.
		const forgedPayload = b64url(JSON.stringify({ exp: 9_999_999_999 }));
		jar.set('craftnight_organizer', `${forgedPayload}.${signature}`);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
	});
});

describe('organizer session — tampering and wrong keys', () => {
	it('rejects a changed or truncated or empty signature', async () => {
		const { cookies, jar } = fakeCookies();
		await setOrganizerSession(cookies, envWith(SECRET));
		const good = jar.get('craftnight_organizer')!;
		const flipped = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

		for (const bad of [flipped, good.slice(0, -10), good.slice(0, good.lastIndexOf('.') + 1)]) {
			jar.set('craftnight_organizer', bad);
			expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
		}
	});

	it('rejects a session signed under a DIFFERENT secret', async () => {
		const { cookies } = fakeCookies();
		await setOrganizerSession(cookies, envWith('secret-A'));
		expect(await isOrganizerSessionValid(cookies, envWith('secret-B'))).toBe(false);
	});

	it('rotating the secret invalidates every existing session', async () => {
		const { cookies } = fakeCookies();
		await setOrganizerSession(cookies, envWith('old-secret'));
		expect(await isOrganizerSessionValid(cookies, envWith('old-secret'))).toBe(true);
		expect(await isOrganizerSessionValid(cookies, envWith('new-secret'))).toBe(false);
	});

	it('is not valid when there is no cookie at all', async () => {
		const { cookies } = fakeCookies();
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
	});

	it.each(['', 'nodot', '.', 'a.b', 'abc.', '.abc', '...', 'not base64.deadbeef'])(
		'rejects the garbage cookie %j without throwing',
		async (garbage) => {
			const { cookies, jar } = fakeCookies();
			jar.set('craftnight_organizer', garbage);
			await expect(isOrganizerSessionValid(cookies, envWith(SECRET))).resolves.toBe(false);
		}
	);
});

describe('organizer session — a VALID signature over a bad payload (FR-057)', () => {
	// The signature proves the server wrote it; the payload check is a separate
	// line of defence.
	it.each([
		['not JSON', async () => signedRaw(SECRET, 'bm90LWpzb24')],
		['JSON without exp', async () => signedJson(SECRET, { user: 'matt' })],
		['exp as a string', async () => signedJson(SECRET, { exp: '9999999999' })],
		['exp as null', async () => signedJson(SECRET, { exp: null })],
		['exp in the past', async () => signedJson(SECRET, { exp: 1 })],
		['a JSON array', async () => signedJson(SECRET, [9_999_999_999])],
		['JSON null', async () => signedJson(SECRET, null)]
	])('rejects %s', async (_label, make) => {
		const { cookies, jar } = fakeCookies();
		jar.set('craftnight_organizer', await make());
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(false);
	});

	it('accepts a well-formed payload with a future exp (proves the cases above fail for the right reason)', async () => {
		const { cookies, jar } = fakeCookies();
		jar.set(
			'craftnight_organizer',
			await signedJson(SECRET, { exp: Math.floor(Date.now() / 1000) + 3600 })
		);
		expect(await isOrganizerSessionValid(cookies, envWith(SECRET))).toBe(true);
	});
});

describe('organizer session — fails CLOSED without a secret (FR-057)', () => {
	it('will not create a session without SESSION_SECRET', async () => {
		const { cookies, jar } = fakeCookies();
		expect(await setOrganizerSession(cookies, envWith(undefined))).toBe(false);
		expect(await setOrganizerSession(cookies, envWith(''))).toBe(false);
		expect(await setOrganizerSession(cookies, undefined)).toBe(false);
		expect(jar.size).toBe(0);
	});

	it('is invalid without SESSION_SECRET even if a cookie is present', async () => {
		const { cookies, jar } = fakeCookies();
		jar.set('craftnight_organizer', await signedJson(SECRET, { exp: 9_999_999_999 }));
		expect(await isOrganizerSessionValid(cookies, envWith(undefined))).toBe(false);
		expect(await isOrganizerSessionValid(cookies, envWith(''))).toBe(false);
		expect(await isOrganizerSessionValid(cookies, undefined)).toBe(false);
	});
});

describe('the dev bypass in a PRODUCTION build (dev = false)', () => {
	it('cannot be switched on by the environment flag', async () => {
		// This is the property the old `NODE_ENV !== "production"` check lacked.
		const { cookies } = fakeCookies();
		const env = envWith(SECRET, { DANGEROUSLY_DISABLE_ORGANIZER_AUTH: 'true' });
		expect(await isOrganizerSessionValid(cookies, env)).toBe(false);
	});

	it('cannot be switched on even with the flag set and no secret', async () => {
		const { cookies } = fakeCookies();
		const env = envWith(undefined, { DANGEROUSLY_DISABLE_ORGANIZER_AUTH: 'true' });
		expect(await isOrganizerSessionValid(cookies, env)).toBe(false);
	});
});

// ─── subscriber cookie ──────────────────────────────────────────────────────

describe('subscriber cookie map', () => {
	it('round-trips a slug -> guest-id map', async () => {
		const { cookies } = fakeCookies();
		expect(await writeSubscriberCookieMap(cookies, SECRET, { 'craft-night': 'guest-1' })).toBe(true);
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({ 'craft-night': 'guest-1' });
	});

	it('holds several events at once', async () => {
		const { cookies } = fakeCookies();
		await writeSubscriberCookieMap(cookies, SECRET, { a: 'g1', b: 'g2', c: 'g3' });
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({ a: 'g1', b: 'g2', c: 'g3' });
	});

	it('is set httpOnly, Secure, SameSite=Lax for one year (NF-003)', async () => {
		const { cookies, setCalls } = fakeCookies();
		await writeSubscriberCookieMap(cookies, SECRET, { a: 'g1' });
		expect(setCalls[0].name).toBe('craftnight_id');
		expect(setCalls[0].opts).toMatchObject({
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	});

	it('returns an empty map when there is no cookie', async () => {
		const { cookies } = fakeCookies();
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({});
	});

	it('a tampered map is discarded whole, so one guest cannot claim another', async () => {
		const { cookies, jar } = fakeCookies();
		await writeSubscriberCookieMap(cookies, SECRET, { 'craft-night': 'guest-1' });
		const [, signature] = jar.get('craftnight_id')!.split('.');
		// Swap in someone else's id but keep the original signature.
		jar.set('craftnight_id', `${b64url(JSON.stringify({ 'craft-night': 'guest-VICTIM' }))}.${signature}`);
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({});
	});

	it('a map signed under a different secret is discarded', async () => {
		const { cookies } = fakeCookies();
		await writeSubscriberCookieMap(cookies, 'secret-A', { a: 'g1' });
		expect(await readSubscriberCookieMap(cookies, 'secret-B')).toEqual({});
	});

	it('fails closed without a secret: reads nothing and writes nothing', async () => {
		const { cookies, jar } = fakeCookies();
		expect(await writeSubscriberCookieMap(cookies, undefined, { a: 'g1' })).toBe(false);
		expect(jar.size).toBe(0);
		jar.set('craftnight_id', await signedJson(SECRET, { a: 'g1' }));
		expect(await readSubscriberCookieMap(cookies, undefined)).toEqual({});
	});

	it('keeps only string values from a validly-signed map', async () => {
		const { cookies, jar } = fakeCookies();
		jar.set(
			'craftnight_id',
			await signedJson(SECRET, { ok: 'guest-1', n: 5, nil: null, obj: {}, arr: ['x'], t: true })
		);
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({ ok: 'guest-1' });
	});

	it.each([
		['a JSON array', async () => signedJson(SECRET, ['a'])],
		['a JSON string', async () => signedJson(SECRET, 'guest-1')],
		['a JSON number', async () => signedJson(SECRET, 7)],
		['JSON null', async () => signedJson(SECRET, null)],
		['not JSON', async () => signedRaw(SECRET, 'bm90LWpzb24')]
	])('treats %s as an empty map', async (_label, make) => {
		const { cookies, jar } = fakeCookies();
		jar.set('craftnight_id', await make());
		expect(await readSubscriberCookieMap(cookies, SECRET)).toEqual({});
	});
});
