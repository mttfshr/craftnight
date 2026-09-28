import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '$lib/server/password';

// Iteration count doesn't change what is being tested, only how long it takes.
const FAST = 1_000;

describe('hashPassword / verifyPassword — round trip', () => {
	it('verifies the password that was hashed', async () => {
		const hash = await hashPassword('correct horse battery staple', FAST);
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
	});

	it('rejects a wrong password', async () => {
		const hash = await hashPassword('correct horse battery staple', FAST);
		expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false);
		expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
		expect(await verifyPassword('', hash)).toBe(false);
	});

	it('handles non-ASCII passwords', async () => {
		const password = 'pässwörd-🎨-陶芸';
		const hash = await hashPassword(password, FAST);
		expect(await verifyPassword(password, hash)).toBe(true);
		expect(await verifyPassword('passwörd-🎨-陶芸', hash)).toBe(false);
	});

	it('salts every hash: the same password never hashes the same twice, yet both verify', async () => {
		const a = await hashPassword('same password', FAST);
		const b = await hashPassword('same password', FAST);
		expect(a).not.toBe(b);
		expect(await verifyPassword('same password', a)).toBe(true);
		expect(await verifyPassword('same password', b)).toBe(true);
	});
});

describe('stored format', () => {
	it('is pbkdf2$<iterations>$<salt>$<hash> with the 100000 default', async () => {
		const parts = (await hashPassword('x')).split('$');
		expect(parts).toHaveLength(4);
		expect(parts[0]).toBe('pbkdf2');
		expect(parts[1]).toBe('100000');
		// 16-byte salt and 32-byte key, base64: 24 and 44 characters
		expect(parts[2]).toHaveLength(24);
		expect(parts[3]).toHaveLength(44);
	});

	it('reads the iteration count FROM the hash, so lowering it later needs no code change', async () => {
		// The claim behind the CPU-limit advice: regenerate the hash with fewer
		// iterations and the verifier follows, with no redeploy of code.
		const low = await hashPassword('pw', 1_000);
		const high = await hashPassword('pw', 5_000);
		expect(low.split('$')[1]).toBe('1000');
		expect(high.split('$')[1]).toBe('5000');
		expect(await verifyPassword('pw', low)).toBe(true);
		expect(await verifyPassword('pw', high)).toBe(true);
	});

	it('a hash made with different iterations does not verify against a rewritten count', async () => {
		// Tampering with the stored count changes the derived key, so it must fail.
		const hash = await hashPassword('pw', 2_000);
		const [scheme, , salt, key] = hash.split('$');
		expect(await verifyPassword('pw', `${scheme}$2001$${salt}$${key}`)).toBe(false);
	});
});

describe('verifyPassword fails CLOSED (FR-057)', () => {
	// A deploy that forgot `wrangler secret put`, or a corrupted secret, must
	// reject every login. Every one of these must come back false, never throw
	// and never accept.
	it.each([
		['undefined (secret not set)', undefined],
		['empty string', ''],
		['not a hash at all', 'garbage'],
		['a bcrypt-style value', '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234'],
		['wrong scheme', 'scrypt$1000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['too few parts', 'pbkdf2$1000$AAAAAAAAAAAAAAAAAAAAAA=='],
		['too many parts', 'pbkdf2$1000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=$extra'],
		['non-numeric iterations', 'pbkdf2$lots$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['zero iterations', 'pbkdf2$0$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['negative iterations', 'pbkdf2$-5$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['fractional iterations', 'pbkdf2$10.5$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['salt that is not base64', 'pbkdf2$1000$!!!not-base64!!!$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
		['hash of the wrong length', 'pbkdf2$1000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA']
	])('rejects %s', async (_label, stored) => {
		await expect(verifyPassword('anything', stored)).resolves.toBe(false);
	});

	it('rejects a hash with one character changed', async () => {
		// Change the FIRST character of the key field: all six of its bits are
		// significant, so the decoded bytes always differ. (An earlier version of
		// this test changed the character before the final "=". That character
		// carries only 4 real bits plus 2 padding bits, so swapping A for B decodes
		// to the SAME bytes and the hash still verified: the test failed about 1 run
		// in 16, at random. The app was right to accept it; the test was wrong.)
		// Many hashes are tried so the result doesn't hinge on one random sample.
		for (let i = 0; i < 16; i++) {
			const hash = await hashPassword('pw', FAST);
			const [scheme, iterations, salt, key] = hash.split('$');
			const tampered = [scheme, iterations, salt, (key[0] === 'A' ? 'B' : 'A') + key.slice(1)].join('$');
			expect(tampered).not.toBe(hash);
			expect(await verifyPassword('pw', tampered)).toBe(false);
		}
	});

	it('tampering with the salt also fails', async () => {
		const hash = await hashPassword('pw', FAST);
		const [scheme, iterations, salt, key] = hash.split('$');
		const tampered = [scheme, iterations, (salt[0] === 'A' ? 'B' : 'A') + salt.slice(1), key].join('$');
		expect(await verifyPassword('pw', tampered)).toBe(false);
	});
});
