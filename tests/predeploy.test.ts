import { describe, expect, it } from 'vitest';
import { REQUIRED_SECRETS, TURNSTILE_TEST_KEYS, checkConfig, parseJsonc, parseSecretNames } from '../scripts/predeploy-check.mjs';

/** A config that should pass every check. Tests break one thing at a time. */
const good = () => ({
	name: 'craftnight',
	compatibility_flags: [] as string[],
	d1_databases: [{ binding: 'DB', database_id: '90e657c9-1ca8-486e-a336-0abfbb8297a9' }],
	r2_buckets: [{ binding: 'BUCKET', bucket_name: 'craftnight-media' }],
	vars: {
		R2_PUBLIC_URL: 'https://pub-abc123.r2.dev',
		PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAreal-site-key'
	},
	routes: [{ pattern: 'craftnight.example', custom_domain: true }] as unknown[] | undefined
});

const problems = (config: object) => checkConfig(config).errors;

describe('checkConfig — a good config', () => {
	it('has no errors and no warnings', () => {
		expect(checkConfig(good())).toEqual({ errors: [], warnings: [] });
	});

	it('warns, but does not fail, when there is no custom domain yet', () => {
		const config = good();
		config.routes = undefined;
		const { errors, warnings } = checkConfig(config);
		expect(errors).toEqual([]);
		expect(warnings.join(' ')).toMatch(/workers\.dev/);
	});
});

describe('checkConfig — Turnstile (a protection that could silently become decoration)', () => {
	it.each(Object.keys(TURNSTILE_TEST_KEYS))("refuses Cloudflare's dummy site key %s", (key) => {
		const config = good();
		config.vars.PUBLIC_TURNSTILE_SITE_KEY = key;
		const errors = problems(config);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/dummy key/);
		expect(errors[0]).toMatch(/bot protection/i);
	});

	it('refuses a missing site key', () => {
		const config = good();
		delete (config.vars as Record<string, unknown>).PUBLIC_TURNSTILE_SITE_KEY;
		expect(problems(config).join(' ')).toMatch(/PUBLIC_TURNSTILE_SITE_KEY is not set/);
	});

	it('accepts a real-looking site key', () => {
		expect(problems(good())).toEqual([]);
	});
});

describe('checkConfig — placeholders and bindings', () => {
	it.each(['REPLACE_ME', 'https://REPLACE_ME', ''])('refuses R2_PUBLIC_URL = %j', (value) => {
		const config = good();
		config.vars.R2_PUBLIC_URL = value;
		expect(problems(config).join(' ')).toMatch(/R2_PUBLIC_URL/);
	});

	it('refuses a non-https R2_PUBLIC_URL (stored image URLs would be mixed content)', () => {
		const config = good();
		config.vars.R2_PUBLIC_URL = 'http://pub-abc123.r2.dev';
		expect(problems(config).join(' ')).toMatch(/https/);
	});

	it.each(['REPLACE_ME', '', 'not-a-uuid', '90e657c9-1ca8-486e-a336'])(
		'refuses D1 database_id %j',
		(id) => {
			const config = good();
			config.d1_databases[0].database_id = id;
			expect(problems(config).join(' ')).toMatch(/database_id/);
		}
	);

	it('refuses a missing DB or BUCKET binding', () => {
		const noDb = { ...good(), d1_databases: [] };
		const noBucket = { ...good(), r2_buckets: [] };
		expect(problems(noDb).join(' ')).toMatch(/D1 binding/);
		expect(problems(noBucket).join(' ')).toMatch(/R2 binding/);
	});

	it('refuses a config with no name', () => {
		const { name: _omit, ...noName } = good();
		expect(problems(noName).join(' ')).toMatch(/name/);
	});
});

describe('checkConfig — NF-006 and committed secrets', () => {
	it.each(['nodejs_compat', 'nodejs_compat_v2'])('refuses the %s flag', (flag) => {
		const config = good();
		config.compatibility_flags = [flag];
		expect(problems(config).join(' ')).toMatch(/NF-006/);
	});

	it('allows other compatibility flags', () => {
		const config = good();
		config.compatibility_flags = ['global_fetch_strictly_public'];
		expect(problems(config)).toEqual([]);
	});

	it.each(REQUIRED_SECRETS)('refuses %s appearing in vars, which is committed to git', (name) => {
		const config = good();
		(config.vars as Record<string, string>)[name] = 'oops';
		const errors = problems(config);
		expect(errors.join(' ')).toContain(name);
		expect(errors.join(' ')).toMatch(/committed to git/);
	});

	it('reports EVERY problem at once, not just the first', () => {
		const bad = {
			name: 'craftnight',
			compatibility_flags: ['nodejs_compat'],
			d1_databases: [{ binding: 'DB', database_id: 'REPLACE_ME' }],
			r2_buckets: [],
			vars: { R2_PUBLIC_URL: 'REPLACE_ME', PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }
		};
		expect(problems(bad).length).toBeGreaterThanOrEqual(5);
	});
});

describe('parseJsonc', () => {
	it('parses plain JSON', () => {
		expect(parseJsonc('{"a": 1, "b": [true, null]}')).toEqual({ a: 1, b: [true, null] });
	});

	it('strips line and block comments', () => {
		const text = `{
			// a line comment
			"a": 1, /* inline */ "b": 2
			/* multi
			   line */
		}`;
		expect(parseJsonc(text)).toEqual({ a: 1, b: 2 });
	});

	it('does NOT treat // inside a string as a comment (URLs)', () => {
		// The case a naive regex gets wrong, and the reason for the scanner.
		expect(parseJsonc('{"url": "https://pub-abc.r2.dev/path"} // trailing')).toEqual({
			url: 'https://pub-abc.r2.dev/path'
		});
	});

	it('does not treat /* inside a string as a comment', () => {
		expect(parseJsonc('{"glob": "src/**/*.ts", "b": 1}')).toEqual({ glob: 'src/**/*.ts', b: 1 });
	});

	it('handles escaped quotes inside strings', () => {
		expect(parseJsonc('{"q": "say \\"hi\\" // not a comment"}')).toEqual({
			q: 'say "hi" // not a comment'
		});
	});

	it('drops trailing commas in objects and arrays, including before a comment', () => {
		expect(parseJsonc('{"a": [1, 2,], "b": 3, }')).toEqual({ a: [1, 2], b: 3 });
		expect(parseJsonc('{"a": 1, // note\n}')).toEqual({ a: 1 });
	});

	it('keeps commas that are not trailing', () => {
		expect(parseJsonc('{"a": [1, 2, 3], "b": {"c": 1, "d": 2}}')).toEqual({
			a: [1, 2, 3],
			b: { c: 1, d: 2 }
		});
	});

	it('does not drop a comma inside a string that looks trailing', () => {
		expect(parseJsonc('{"s": "a,}"}')).toEqual({ s: 'a,}' });
	});

	it('throws on genuinely invalid input rather than guessing', () => {
		expect(() => parseJsonc('{"a": }')).toThrow();
	});
});

describe('parseSecretNames — `wrangler secret list --format json` output', () => {
	// Wrangler prints JSON.stringify(secrets, null, "  "); this is that shape.
	const listing = (names: string[]) =>
		JSON.stringify(
			names.map((name) => ({ name, type: 'secret_text' })),
			null,
			'  '
		) + '\n';

	it('reads the names from a real-shaped listing', () => {
		expect(parseSecretNames(listing(['SESSION_SECRET', 'ORGANIZER_PASSWORD_HASH']))).toEqual([
			'SESSION_SECRET',
			'ORGANIZER_PASSWORD_HASH'
		]);
	});

	it('reads an empty listing as "no secrets", not as a failure', () => {
		// A Worker that exists but has no secrets: [] is a valid, meaningful answer.
		expect(parseSecretNames('[]\n')).toEqual([]);
		expect(parseSecretNames(listing([]))).toEqual([]);
	});

	it('is not derailed by a bracket in a log line before the JSON', () => {
		const noisy = ' ⛅️ wrangler 4.142.0 [update available]\nsome [note] here\n' + listing(['A', 'B']);
		expect(parseSecretNames(noisy)).toEqual(['A', 'B']);
	});

	it('is not derailed by output after the JSON', () => {
		const noisy = listing(['A']) + '🪵  Logs were written to "/path/[x].log"\n';
		expect(parseSecretNames(noisy)).toEqual(['A']);
	});

	it('handles Windows line endings', () => {
		expect(parseSecretNames(listing(['A', 'B']).replace(/\n/g, '\r\n'))).toEqual(['A', 'B']);
	});

	it('returns null, so the caller reports a parse failure, for anything unreadable', () => {
		expect(parseSecretNames('')).toBeNull();
		expect(parseSecretNames('not json at all')).toBeNull();
		expect(parseSecretNames('[\n  { broken\n]\n')).toBeNull();
	});

	it('ignores entries that have no string name', () => {
		expect(parseSecretNames('[\n  {"name": "A"},\n  {"type": "x"},\n  {"name": 5}\n]\n')).toEqual(['A']);
	});
});

describe('the real wrangler.jsonc', () => {
	// Not a deploy gate — deploying is gated by `npm run deploy` — but it proves
	// the parser copes with the file it exists to read.
	it('parses, and has the bindings the app requires', async () => {
		const files = import.meta.glob('/wrangler.jsonc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
		const config = parseJsonc(Object.values(files)[0]);
		expect(config.name).toBe('craftnight');
		expect(config.d1_databases.some((d: { binding: string }) => d.binding === 'DB')).toBe(true);
		expect(config.r2_buckets.some((b: { binding: string }) => b.binding === 'BUCKET')).toBe(true);
	});

	it('never enables nodejs_compat', async () => {
		const files = import.meta.glob('/wrangler.jsonc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
		const config = parseJsonc(Object.values(files)[0]);
		expect(checkConfig(config).errors.join(' ')).not.toMatch(/NF-006/);
	});
});
