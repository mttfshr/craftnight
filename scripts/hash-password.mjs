// Generate the ORGANIZER_PASSWORD_HASH value.
//
//   npm run hash-password -- 'your password here'
//
// Plain .mjs on purpose: the TS project excludes @types/node so that node:*
// and Buffer fail to typecheck in src/ (NF-006). Node-only tooling stays
// outside that project rather than carving out an exception. Node 18+ has
// WebCrypto as a global, so this needs no dependencies. It duplicates the
// derivation in src/lib/server/password.ts rather than importing across the
// boundary — if you change the iteration count in one, change it in both.

const SCHEME = 'pbkdf2';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const ITERATIONS = 100_000;

const password = process.argv[2];

if (!password) {
	console.error("Usage: npm run hash-password -- '<password>'");
	console.error('Quote it, or your shell will eat the special characters.');
	process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

const keyMaterial = await crypto.subtle.importKey(
	'raw',
	new TextEncoder().encode(password),
	'PBKDF2',
	false,
	['deriveBits']
);

const bits = await crypto.subtle.deriveBits(
	{ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
	keyMaterial,
	KEY_BYTES * 8
);

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hash = `${SCHEME}$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

console.log('');
console.log('Add to .dev.vars. Note the $ signs: wrangler does NOT interpolate,');
console.log('so paste the hash exactly as printed. Do not escape them the way');
console.log('the old dotenv-based .env required.');
console.log('');
console.log(`ORGANIZER_PASSWORD_HASH="${hash}"`);
console.log('');
console.log('For production: npx wrangler secret put ORGANIZER_PASSWORD_HASH');
console.log('');
