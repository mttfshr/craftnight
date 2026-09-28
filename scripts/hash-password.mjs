// Generate the ORGANIZER_PASSWORD_HASH value.
//
//   npm run hash-password -- 'your password here'
//   npm run hash-password -- 'your password here' 50000     (custom iteration count)
//
// Plain .mjs on purpose: the TS project excludes @types/node so that node:*
// and Buffer fail to typecheck in src/ (NF-006). Node-only tooling stays
// outside that project rather than carving out an exception. Node 18+ has
// WebCrypto as a global, so this needs no dependencies. It duplicates the
// derivation in src/lib/server/password.ts rather than importing across the
// boundary — if you change the default iteration count in one, change both.
//
// The iteration count is stored INSIDE the hash string, and verifyPassword
// reads it back from there, so lowering it later needs no code change: run this
// again with a smaller number and `wrangler secret put ORGANIZER_PASSWORD_HASH`.

const SCHEME = 'pbkdf2';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const DEFAULT_ITERATIONS = 100_000;

const password = process.argv[2];
const iterationsArg = process.argv[3];

if (!password) {
	console.error("Usage: npm run hash-password -- '<password>' [iterations]");
	console.error('Quote the password, or your shell will eat the special characters.');
	process.exit(1);
}

const iterations = iterationsArg === undefined ? DEFAULT_ITERATIONS : Number(iterationsArg);
if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) {
	console.error(`Iterations must be a whole number between 10000 and 1000000 (got "${iterationsArg}").`);
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
	{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
	keyMaterial,
	KEY_BYTES * 8
);

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hash = `${SCHEME}$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

console.log('');
console.log('Add to .dev.vars. Note the $ signs: wrangler does NOT interpolate,');
console.log('so paste the hash exactly as printed. Do not escape them the way');
console.log('the old dotenv-based .env required.');
console.log('');
console.log(`ORGANIZER_PASSWORD_HASH="${hash}"`);
console.log('');
console.log('For production: npx wrangler secret put ORGANIZER_PASSWORD_HASH');
console.log('');
console.log(`Iterations: ${iterations}. Measured on a fast laptop, 100000 costs ~10 ms of raw`);
console.log('PBKDF2. The Workers FREE plan allows ~10 ms of CPU per request, so if login');
console.log('fails in production with "Worker exceeded CPU time limit", re-run this with');
console.log('a smaller count (e.g. 50000) and put the new hash. No redeploy of code needed.');
console.log('');
