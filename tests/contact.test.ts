import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone, readContact } from '$lib/utils/contact';

describe('normalizePhone', () => {
	// Every way a person might type the same number must land on the same string,
	// or identity matching (resolveSubscriber step 3) quietly splits one guest in two.
	it.each([
		'4155550100',
		'415-555-0100',
		'(415) 555-0100',
		'415.555.0100',
		'415 555 0100',
		'  (415)555-0100  ',
		'1 415 555 0100',
		'1-415-555-0100',
		'+1 (415) 555-0100',
		'+14155550100'
	])('reads %j as +14155550100', (input) => {
		expect(normalizePhone(input)).toBe('+14155550100');
	});

	it('keeps an explicit international number as +digits', () => {
		expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
		expect(normalizePhone('+52 55 1234 5678')).toBe('+525512345678');
	});

	it.each([
		['too short — no area code', '555-0100'],
		['7 digits', '5550100'],
		['11 digits not starting with 1', '44791112345'],
		['international without a +', '447911123456'],
		['area code starting with 0', '0155550100'],
		['area code starting with 1', '1155550100'],
		['letters / extension', '415-555-0100 ext 5'],
		['words', 'call me'],
		['too few digits after +', '+123456'],
		['too many digits after +', '+1234567890123456'],
		['empty', ''],
		['punctuation only', '()-']
	])('rejects %s', (_label, input) => {
		expect(normalizePhone(input)).toBeNull();
	});

	it('is idempotent: normalizing a normalized number changes nothing', () => {
		const once = normalizePhone('(415) 555-0100')!;
		expect(normalizePhone(once)).toBe(once);
	});
});

describe('normalizeEmail', () => {
	it('lowercases and trims, so case and stray spaces never split a guest', () => {
		expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com');
		expect(normalizeEmail('sam@example.com')).toBe('sam@example.com');
	});

	it.each(['sam', 'sam@', '@x.com', 'sam@x', 'sa m@x.com', 'sam@x .com', ''])(
		'rejects %j',
		(input) => {
			expect(normalizeEmail(input)).toBeNull();
		}
	);
});

describe('readContact', () => {
	it('accepts email only', () => {
		expect(readContact('Sam@X.com', '')).toEqual({ email: 'sam@x.com', phone: null, error: null });
	});

	it('accepts phone only', () => {
		expect(readContact('', '(415) 555-0100')).toEqual({
			email: null,
			phone: '+14155550100',
			error: null
		});
	});

	it('accepts both', () => {
		expect(readContact('sam@x.com', '415-555-0100')).toEqual({
			email: 'sam@x.com',
			phone: '+14155550100',
			error: null
		});
	});

	it('requires at least one', () => {
		expect(readContact('', '').error).toBe('Email or phone number is required.');
		expect(readContact('   ', '   ').error).toBe('Email or phone number is required.');
	});

	it('treats non-strings (missing form fields) as empty', () => {
		expect(readContact(null, null).error).toBe('Email or phone number is required.');
		expect(readContact(null, '415-555-0100').phone).toBe('+14155550100');
	});

	it('reports a filled-in but unreadable phone as a phone problem, not as "required"', () => {
		// The regression this guards: a typo in the phone used to be dropped
		// silently, then surface as a confusing "email or phone is required".
		const result = readContact('', '555-0100');
		expect(result.error).toMatch(/phone number/i);
		expect(result.error).not.toMatch(/required/i);
	});

	it('does not let a good email mask a bad phone', () => {
		const result = readContact('sam@x.com', 'nope');
		expect(result.error).toMatch(/phone number/i);
		expect(result.email).toBeNull();
	});

	it('reports an unreadable email as an email problem', () => {
		expect(readContact('not-an-email', '415-555-0100').error).toMatch(/email/i);
	});
});
