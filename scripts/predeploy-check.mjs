// Pre-deploy checks. Run automatically by `npm run deploy`; run alone with
// `npm run deploy:check`.
//
//   node scripts/predeploy-check.mjs             config checks + production secrets
//   node scripts/predeploy-check.mjs --offline   config checks only (no network)
//
// Why this exists: several protections in this app FAIL CLOSED when configured
// wrongly (no secret => login impossible, Turnstile rejects everyone) and one
// silently turns into decoration (Cloudflare's dummy Turnstile site key passes
// every check). Both are cheap to catch before a deploy and expensive to find
// afterwards.
//
// Plain .mjs, outside the TS project like hash-password.mjs, because it needs
// Node built-ins (NF-006 keeps those out of src/). The checks are a pure
// function so tests/predeploy.test.ts can exercise them without a network.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Cloudflare's documented dummy Turnstile site keys. None of them protects anything. */
export const TURNSTILE_TEST_KEYS = {
	'1x00000000000000000000AA': 'always passes',
	'2x00000000000000000000AB': 'always blocks',
	'3x00000000000000000000FF': 'forces an interactive challenge'
};

/** Values that must live in `wrangler secret put`, never in wrangler.jsonc. */
export const REQUIRED_SECRETS = ['SESSION_SECRET', 'ORGANIZER_PASSWORD_HASH', 'CLOUDFLARE_TURNSTILE_SECRET'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses JSONC (comments and trailing commas). Done with a small scanner rather
 * than a regex because `//` appears inside string values ("https://...") and a
 * naive comment-stripper would corrupt every URL.
 */
export function parseJsonc(text) {
	let out = '';
	let i = 0;
	let inString = false;

	const skipTrivia = (from) => {
		let j = from;
		for (;;) {
			while (j < text.length && /\s/.test(text[j])) j++;
			if (text.startsWith('//', j)) {
				while (j < text.length && text[j] !== '\n') j++;
			} else if (text.startsWith('/*', j)) {
				const end = text.indexOf('*/', j + 2);
				j = end === -1 ? text.length : end + 2;
			} else return j;
		}
	};

	while (i < text.length) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (ch === '\\') out += text[++i] ?? '';
			else if (ch === '"') inString = false;
			i++;
		} else if (ch === '"') {
			inString = true;
			out += ch;
			i++;
		} else if (text.startsWith('//', i)) {
			while (i < text.length && text[i] !== '\n') i++;
		} else if (text.startsWith('/*', i)) {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 2;
		} else if (ch === ',') {
			// Drop a trailing comma: one whose next real token closes the container.
			const next = text[skipTrivia(i + 1)];
			if (next !== '}' && next !== ']') out += ch;
			i++;
		} else {
			out += ch;
			i++;
		}
	}
	return JSON.parse(out);
}

/**
 * Checks a parsed wrangler config. `errors` block a deploy; `warnings` don't.
 * Pure: no filesystem, no network.
 */
export function checkConfig(config) {
	const errors = [];
	const warnings = [];
	const vars = config.vars ?? {};

	if (!config.name) errors.push('wrangler.jsonc has no `name`.');

	// NF-006: Node built-ins are deliberately unavailable. This flag would let a
	// Node-shaped dependency creep back in unnoticed.
	const flags = config.compatibility_flags ?? [];
	for (const flag of flags) {
		if (/^nodejs_compat/.test(flag)) {
			errors.push(`compatibility flag "${flag}" is set. NF-006 forbids Node built-ins; remove it.`);
		}
	}

	const d1 = (config.d1_databases ?? []).find((d) => d.binding === 'DB');
	if (!d1) errors.push('No D1 binding named "DB".');
	else if (!d1.database_id || !UUID.test(d1.database_id)) {
		errors.push(`D1 "DB" has no real database_id (found "${d1.database_id ?? ''}"). Run \`wrangler d1 create\` and paste the id.`);
	}

	if (!(config.r2_buckets ?? []).some((b) => b.binding === 'BUCKET')) {
		errors.push('No R2 binding named "BUCKET".');
	}

	const publicUrl = vars.R2_PUBLIC_URL;
	if (!publicUrl || /REPLACE_ME/.test(publicUrl)) {
		errors.push('vars.R2_PUBLIC_URL is unset or still a placeholder. Enable public access on the bucket and paste its URL.');
	} else if (!/^https:\/\//.test(publicUrl)) {
		errors.push(`vars.R2_PUBLIC_URL must be an https:// URL (found "${publicUrl}"). Uploaded images are stored under it.`);
	}

	const siteKey = vars.PUBLIC_TURNSTILE_SITE_KEY;
	if (!siteKey) {
		errors.push('vars.PUBLIC_TURNSTILE_SITE_KEY is not set.');
	} else if (siteKey in TURNSTILE_TEST_KEYS) {
		errors.push(
			`vars.PUBLIC_TURNSTILE_SITE_KEY is Cloudflare's dummy key (${TURNSTILE_TEST_KEYS[siteKey]}). ` +
				'Deploying it leaves bot protection switched off. Create a real Turnstile widget and use its site key, ' +
				'with the matching secret in CLOUDFLARE_TURNSTILE_SECRET.'
		);
	}

	// A secret in `vars` is committed to git in plain text.
	for (const name of REQUIRED_SECRETS) {
		if (name in vars) {
			errors.push(`${name} is set in wrangler.jsonc \`vars\`, which is committed to git. Move it to \`wrangler secret put ${name}\`.`);
		}
	}

	if (!config.routes && !config.route) {
		warnings.push('No custom domain route: this will be served from workers.dev only. Fine for now; add a route later.');
	}

	return { errors, warnings };
}

/**
 * Secret names out of `wrangler secret list --format json` output, or null if
 * none can be read. Wrangler prints `JSON.stringify(secrets, null, "  ")`, so
 * the array opens with `[` at the start of a line and closes with `]` at the
 * start of a line (or is a bare `[]`). Anchoring on that, rather than on the
 * first `[` anywhere, keeps a stray bracket in a log line from derailing it.
 */
export function parseSecretNames(stdout) {
	const match = stdout.match(/^\[\]|^\[[ \t]*\r?\n[\s\S]*?^\]/m);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[0]);
		if (!Array.isArray(parsed)) return null;
		return parsed.map((secret) => secret?.name).filter((name) => typeof name === 'string');
	} catch {
		return null;
	}
}

/** Names of the secrets set on the deployed Worker, or an explanation of why they couldn't be read. */
function listRemoteSecrets() {
	const result = spawnSync('npx', ['wrangler', 'secret', 'list', '--format', 'json'], {
		encoding: 'utf8',
		timeout: 60_000
	});
	if (result.error || result.status !== 0) {
		const detail = (result.stderr || result.stdout || String(result.error) || '').trim().split('\n').slice(-3).join(' ');
		return { ok: false, detail };
	}
	const names = parseSecretNames(result.stdout);
	return names
		? { ok: true, names }
		: { ok: false, detail: 'could not parse `wrangler secret list` output' };
}

function main() {
	const offline = process.argv.includes('--offline');
	const configText = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
	const { errors, warnings } = checkConfig(parseJsonc(configText));

	if (!offline) {
		const secrets = listRemoteSecrets();
		if (!secrets.ok) {
			errors.push(
				`Could not read the Worker's production secrets (${secrets.detail}). ` +
					'If this is the first deploy the Worker does not exist yet. Set the secrets first: ' +
					'`wrangler secret put` asks whether to create the Worker and add the secret to it (say yes). ' +
					REQUIRED_SECRETS.map((s) => `npx wrangler secret put ${s}`).join(' ; ')
			);
		} else {
			const missing = REQUIRED_SECRETS.filter((s) => !secrets.names.includes(s));
			for (const name of missing) {
				errors.push(`Production secret ${name} is not set. Run: npx wrangler secret put ${name}`);
			}
		}
	}

	for (const w of warnings) console.log(`  warning  ${w}`);
	for (const e of errors) console.error(`  ERROR    ${e}`);
	console.log('');
	if (errors.length) {
		console.error(`Not deploying: ${errors.length} problem${errors.length === 1 ? '' : 's'} above.`);
		process.exit(1);
	}
	console.log(`Pre-deploy checks passed${offline ? ' (offline: production secrets not checked)' : ''}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
