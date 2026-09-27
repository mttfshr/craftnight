/**
 * Organizer password hashing — PBKDF2-HMAC-SHA256 via WebCrypto (FR-059).
 *
 * Replaces bcryptjs, which is a Node-oriented pure-JS implementation and would
 * violate NF-006. WebCrypto's PBKDF2 is native in workerd, so this is both
 * faster and one fewer dependency.
 *
 * Stored format: pbkdf2$<iterations>$<salt-b64>$<hash-b64>
 * Iterations live in the string, so raising them later doesn't invalidate
 * existing hashes — verify reads whatever the hash was made with.
 */

const SCHEME = 'pbkdf2';
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/**
 * CPU budget note: Workers Free allows ~10ms CPU per invocation. 100k
 * iterations may exceed that on the login request specifically (it's the only
 * place this runs, once per 24h session). If login returns "Worker exceeded
 * CPU time limit", lower this and regenerate the hash — the threat model is a
 * single organizer password behind a secret store, not an offline crack of a
 * leaked database, so a lower count is a defensible trade here.
 */
const DEFAULT_ITERATIONS = 100_000;

/**
 * TypeScript's DOM lib made TypedArrays generic over their backing buffer.
 * An unannotated `Uint8Array` widens to `Uint8Array<ArrayBufferLike>`, which
 * `SharedArrayBuffer` also satisfies — and that no longer matches WebCrypto's
 * `BufferSource`, which requires a view over a concrete `ArrayBuffer`. Every
 * array here is allocated locally (never a view onto shared memory), so this
 * alias just keeps that fact visible to the type checker instead of letting
 * it widen away at each function boundary.
 */
type Bytes = Uint8Array<ArrayBuffer>;

function toBase64(bytes: Bytes): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): Bytes {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function derive(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
		keyMaterial,
		KEY_BYTES * 8
	);
	return new Uint8Array(bits);
}

/** Compare without leaking position of first difference via timing. */
function timingSafeEqual(a: Bytes, b: Bytes): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export async function hashPassword(
	password: string,
	iterations = DEFAULT_ITERATIONS
): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, iterations);
	return `${SCHEME}$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Returns false for every failure mode — missing secret, malformed hash,
 * wrong password. A deploy that forgot `wrangler secret put` must reject
 * logins, not accept them (FR-057), which is why `stored` is optional here.
 */
export async function verifyPassword(
	password: string,
	stored: string | undefined
): Promise<boolean> {
	if (!stored) return false;

	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== SCHEME) return false;

	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1) return false;

	let salt: Bytes;
	let expected: Bytes;
	try {
		salt = fromBase64(parts[2]);
		expected = fromBase64(parts[3]);
	} catch {
		return false;
	}
	if (expected.length !== KEY_BYTES) return false;

	const actual = await derive(password, salt, iterations);
	return timingSafeEqual(actual, expected);
}
