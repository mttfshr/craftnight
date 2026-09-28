// Generate the ORGANIZER_PASSWORD_HASH value.
//
//   npm run hash-password -- 'your password'                  human-readable output
//   npm run hash-password -- 'your password' 50000            ...with a custom iteration count
//
// Safer, for production — the password never touches your shell history and the
// hash is never displayed or copied by hand, it goes straight into wrangler:
//
//   read -s "PW?Password: "; echo
//   printf %s "$PW" | node scripts/hash-password.mjs --raw | npx wrangler secret put ORGANIZER_PASSWORD_HASH
//   unset PW
//
// Call `node` directly here, NOT `npm run`: npm prints a "> craftnight@0.0.1
// hash-password" banner to stdout, and in a pipe that banner would become part of
// the stored secret (`npm run -s` suppresses it, but that is easy to forget).
//
//   --raw               print ONLY the hash, on stdout, with no banner (for piping)
//   --iterations N      iteration count (10000-1000000); same as a second positional
//   password            omit it and the password is read from stdin instead, with a
//                       single trailing newline removed (trailing spaces are kept)
//
// Plain .mjs on purpose: the TS project excludes @types/node so that node:*
// and Buffer fail to typecheck in src/ (NF-006). Node-only tooling stays
// outside that project rather than carving out an exception. Node 18+ has
// WebCrypto as a global, so this needs no dependencies. It duplicates the
// derivation in src/lib/server/password.ts rather than importing across the
// boundary — if you change the default iteration count in one, change both.
//
// The iteration count is stored INSIDE the hash string, and verifyPassword reads
// it back from there, so lowering it later needs no code change: run this again
// with a smaller number and `wrangler secret put ORGANIZER_PASSWORD_HASH`.

const SCHEME = 'pbkdf2';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const DEFAULT_ITERATIONS = 100_000;

const args = process.argv.slice(2);
const raw = args.includes('--raw');

// --iterations N (either "--iterations 50000" or "--iterations=50000")
let iterationsArg;
const rest = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--raw') continue;
	if (args[i] === '--iterations') iterationsArg = args[++i];
	else if (args[i].startsWith('--iterations=')) iterationsArg = args[i].slice('--iterations='.length);
	else rest.push(args[i]);
}

// Legacy form: `hash-password 'pw' 50000`. Only meaningful alongside a positional password.
let password = rest[0];
if (rest.length > 1 && iterationsArg === undefined) iterationsArg = rest[1];

/** Everything on stdin, minus ONE trailing newline. Trailing spaces belong to the password. */
async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

if (password === undefined) {
	if (process.stdin.isTTY) {
		fail(
			"Usage: npm run hash-password -- '<password>' [iterations]\n" +
				'   or: read -s "PW?Password: "; printf %s "$PW" | npm run -s hash-password -- --raw\n' +
				'Quote the password, or your shell will eat the special characters.'
		);
	}
	password = await readStdin();
}
if (!password) fail('The password is empty.');

const iterations = iterationsArg === undefined ? DEFAULT_ITERATIONS : Number(iterationsArg);
if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) {
	fail(`Iterations must be a whole number between 10000 and 1000000 (got "${iterationsArg}").`);
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

if (raw) {
	// Nothing but the hash on stdout, so it can be piped straight into
	// `wrangler secret put`. Any commentary would end up inside the secret.
	process.stdout.write(hash);
} else {
	console.log('');
	console.log('Add to .dev.vars. Note the $ signs: wrangler does NOT interpolate,');
	console.log('so paste the hash exactly as printed. Do not escape them the way');
	console.log('the old dotenv-based .env required.');
	console.log('');
	console.log(`ORGANIZER_PASSWORD_HASH="${hash}"`);
	console.log('');
	console.log('For production, without displaying or pasting it (see the top of this file):');
	console.log('  printf %s "$PW" | node scripts/hash-password.mjs --raw | npx wrangler secret put ORGANIZER_PASSWORD_HASH');
	console.log('');
	console.log(`Iterations: ${iterations}. Measured on a fast laptop, 100000 costs ~10 ms of raw`);
	console.log('PBKDF2. The Workers FREE plan allows ~10 ms of CPU per request, so if login');
	console.log('fails in production with "Worker exceeded CPU time limit", re-run this with');
	console.log('a smaller count (e.g. 50000) and put the new hash. No redeploy of code needed.');
	console.log('');
}
