import { dev } from '$app/environment';

/**
 * Cookie signing and session verification.
 *
 * Rewritten 2026-09-27 (ADR-006). Three changes from the Node version:
 *
 * 1. WebCrypto instead of node:crypto, so everything here is async.
 * 2. The organizer session payload now carries an expiry that the SERVER
 *    verifies (NF-002). Previously the payload was the constant string
 *    "authenticated" — identical every time, no exp — so the only expiry was
 *    the cookie's maxAge, a client-side hint. A copied cookie stayed valid
 *    until SESSION_SECRET rotated. plan.md Decision 1 always specified
 *    `{ exp }`; the code had drifted.
 * 3. The `NODE_ENV !== 'production'` bypass is gone. See isAuthBypassed.
 */

const ORGANIZER_COOKIE = 'craftnight_organizer';
const SUBSCRIBER_COOKIE = 'craftnight_id';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours (NF-002)
const SUBSCRIBER_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year (NF-003)

export type Cookies = {
	set: (name: string, value: string, opts: Record<string, unknown>) => void;
	get: (name: string) => string | undefined;
	delete: (name: string, opts: Record<string, unknown>) => void;
};

// ─── base64url without Buffer ────────────────────────────────────────────────

function encodeB64Url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeB64Url(value: string): string {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

// ─── HMAC ────────────────────────────────────────────────────────────────────

async function hmac(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** `<payload>.<signature>` */
async function sign(secret: string, payload: string): Promise<string> {
	return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the payload, or null if the value is malformed or the signature is wrong. */
async function unsign(secret: string, signed: string): Promise<string | null> {
	const dot = signed.lastIndexOf('.');
	if (dot === -1) return null;
	const payload = signed.slice(0, dot);
	const signature = signed.slice(dot + 1);
	const expected = await hmac(secret, payload);
	return timingSafeEqual(expected, signature) ? payload : null;
}

// ─── Dev bypass ──────────────────────────────────────────────────────────────

/**
 * Requires BOTH a dev build AND the explicit flag (FR-057).
 *
 * `dev` comes from $app/environment and is fixed at build time, so a
 * production bundle cannot be talked into bypassing auth no matter what
 * variables are set on the deployed Worker. That is the property the old
 * `process.env.NODE_ENV !== 'production'` check lacked: it inverted to
 * fail-OPEN whenever the variable was unset, which on Workers is always.
 */
function isAuthBypassed(env: App.Platform['env'] | undefined): boolean {
	return dev && env?.DANGEROUSLY_DISABLE_ORGANIZER_AUTH === 'true';
}

// ─── Organizer session ───────────────────────────────────────────────────────

function cookieOptions(maxAge: number) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		// Always secure: a Worker is never served over plain HTTP in production,
		// and localhost is exempt from the secure-cookie rule in every browser.
		secure: true,
		maxAge
	};
}

export async function setOrganizerSession(
	cookies: Cookies,
	env: App.Platform['env'] | undefined
): Promise<boolean> {
	const secret = env?.SESSION_SECRET;
	if (!secret) return false;

	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
	const payload = encodeB64Url(JSON.stringify({ exp }));
	cookies.set(ORGANIZER_COOKIE, await sign(secret, payload), cookieOptions(SESSION_TTL_SECONDS));
	return true;
}

export function clearOrganizerSession(cookies: Cookies): void {
	cookies.delete(ORGANIZER_COOKIE, { path: '/' });
}

export async function isOrganizerSessionValid(
	cookies: Cookies,
	env: App.Platform['env'] | undefined
): Promise<boolean> {
	if (isAuthBypassed(env)) return true;

	const secret = env?.SESSION_SECRET;
	if (!secret) return false; // fail closed on a misconfigured deploy

	const raw = cookies.get(ORGANIZER_COOKIE);
	if (!raw) return false;

	const payload = await unsign(secret, raw);
	if (!payload) return false;

	try {
		const { exp } = JSON.parse(decodeB64Url(payload)) as { exp?: unknown };
		if (typeof exp !== 'number') return false;
		return exp > Math.floor(Date.now() / 1000);
	} catch {
		return false;
	}
}

// ─── Subscriber cookie (slug → UUID map) ─────────────────────────────────────

export async function readSubscriberCookieMap(
	cookies: Cookies,
	secret: string | undefined
): Promise<Record<string, string>> {
	if (!secret) return {};
	const raw = cookies.get(SUBSCRIBER_COOKIE);
	if (!raw) return {};

	const payload = await unsign(secret, raw);
	if (!payload) return {};

	try {
		const parsed: unknown = JSON.parse(decodeB64Url(payload));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		// Drop anything that isn't a string value — the cookie is signed, but a
		// stale format shouldn't put non-strings into a UUID lookup. A plain loop
		// here rather than Object.entries().filter() with a type predicate: TS
		// rejects a predicate that narrows an element of a destructured tuple.
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === 'string') result[key] = value;
		}
		return result;
	} catch {
		return {};
	}
}

export async function writeSubscriberCookieMap(
	cookies: Cookies,
	secret: string | undefined,
	map: Record<string, string>
): Promise<boolean> {
	if (!secret) return false;
	const payload = encodeB64Url(JSON.stringify(map));
	cookies.set(
		SUBSCRIBER_COOKIE,
		await sign(secret, payload),
		cookieOptions(SUBSCRIBER_TTL_SECONDS)
	);
	return true;
}
