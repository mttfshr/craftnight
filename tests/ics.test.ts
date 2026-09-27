import { describe, expect, it } from 'vitest';
import { buildICS, escapeText, foldLine, type IcsInput } from '$lib/utils/ics';

const NOW = new Date('2026-09-27T12:00:00Z');

const base: IcsInput = {
	uid: 'inst-123',
	name: 'Craft Night',
	description: null,
	location: null,
	url: null,
	date: '2026-10-14',
	startTime: '18:00',
	endTime: '21:00',
	timeZone: 'America/Los_Angeles',
	now: NOW
};

/** Undo folding, then split into logical content lines. */
const logical = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
const enc = new TextEncoder();

describe('escapeText', () => {
	it('escapes backslash, semicolon and comma (RFC 5545 3.3.11)', () => {
		expect(escapeText('a\\b')).toBe('a\\\\b');
		expect(escapeText('a;b')).toBe('a\\;b');
		expect(escapeText('a,b')).toBe('a\\,b');
	});

	it('escapes the backslash FIRST, so the escapes it adds are not doubled', () => {
		expect(escapeText('a;b')).toBe('a\\;b'); // one backslash, not two
	});

	it('turns every newline style into a literal \\n', () => {
		expect(escapeText('one\ntwo')).toBe('one\\ntwo');
		expect(escapeText('one\r\ntwo')).toBe('one\\ntwo');
		expect(escapeText('one\rtwo')).toBe('one\\ntwo');
	});

	it('drops control characters but keeps ordinary text, accents and emoji', () => {
		expect(escapeText('a\u0000b\u0007c\u001Fd\u007Fe')).toBe('abcde');
		expect(escapeText('Café ☕ 陶芸')).toBe('Café ☕ 陶芸');
	});
});

describe('foldLine', () => {
	it('leaves short lines alone', () => {
		expect(foldLine('SUMMARY:Craft Night')).toBe('SUMMARY:Craft Night');
	});

	it('never produces a physical line over 75 octets, and unfolds back to the original', () => {
		const line = 'DESCRIPTION:' + 'word '.repeat(80);
		const folded = foldLine(line);

		for (const physical of folded.split('\r\n')) {
			expect(enc.encode(physical).length).toBeLessThanOrEqual(75);
		}
		expect(folded.replace(/\r\n /g, '')).toBe(line);
	});

	it('counts OCTETS not characters, and never splits a multi-byte character', () => {
		// 3-byte CJK, 4-byte emoji (a surrogate pair), and 2-byte accents.
		const line = 'DESCRIPTION:' + '陶芸の夜🎨☕é'.repeat(20);
		const folded = foldLine(line);
		const fatal = new TextDecoder('utf-8', { fatal: true });

		for (const physical of folded.split('\r\n')) {
			expect(enc.encode(physical).length).toBeLessThanOrEqual(75);
			expect(() => fatal.decode(enc.encode(physical))).not.toThrow();
			expect(physical).not.toMatch(/\uFFFD/);
		}
		expect(folded.replace(/\r\n /g, '')).toBe(line);
	});

	it('starts every continuation line with exactly one space', () => {
		const folded = foldLine('X:' + 'a'.repeat(200)).split('\r\n');
		expect(folded.length).toBeGreaterThan(1);
		for (const continuation of folded.slice(1)) {
			expect(continuation.startsWith(' ')).toBe(true);
			expect(continuation.startsWith('  ')).toBe(false);
		}
	});
});

describe('buildICS — structure', () => {
	it('uses CRLF line endings throughout and ends with one', () => {
		const ics = buildICS(base);
		expect(ics.endsWith('\r\n')).toBe(true);
		expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // no bare CR or LF anywhere
	});

	it('has the required calendar and event wrapper, with DTSTAMP', () => {
		const lines = logical(buildICS(base));
		expect(lines[0]).toBe('BEGIN:VCALENDAR');
		expect(lines.at(-1)).toBe('END:VCALENDAR');
		expect(lines).toContain('VERSION:2.0');
		expect(lines).toContain('BEGIN:VEVENT');
		expect(lines).toContain('END:VEVENT');
		// RFC 5545 requires DTSTAMP on every VEVENT; some clients reject the file without it.
		expect(lines).toContain('DTSTAMP:20260927T120000Z');
	});

	it('uses a stable UID derived from the instance id', () => {
		expect(logical(buildICS(base))).toContain('UID:inst-123@craftnight');
		expect(logical(buildICS({ ...base, now: new Date('2030-01-01T00:00:00Z') }))).toContain(
			'UID:inst-123@craftnight'
		);
	});

	it('omits optional properties when absent, and includes them when present', () => {
		const bare = logical(buildICS(base)).join('\n');
		expect(bare).not.toMatch(/^LOCATION:/m);
		expect(bare).not.toMatch(/^DESCRIPTION:/m);
		expect(bare).not.toMatch(/^URL:/m);

		const full = logical(
			buildICS({
				...base,
				location: 'The Studio',
				description: 'Bring an apron',
				url: 'https://craftnight.example/events/tuesday'
			})
		);
		expect(full).toContain('LOCATION:The Studio');
		expect(full).toContain('DESCRIPTION:Bring an apron');
		expect(full).toContain('URL:https://craftnight.example/events/tuesday');
	});
});

describe('buildICS — times (FR-034, UTC instants)', () => {
	const times = (input: IcsInput) => {
		const lines = logical(buildICS(input));
		return {
			start: lines.find((l) => l.startsWith('DTSTART'))!,
			end: lines.find((l) => l.startsWith('DTEND'))!
		};
	};

	it('writes UTC instants with a Z suffix, and no TZID', () => {
		const { start, end } = times(base);
		// 18:00-21:00 PDT (UTC-7) on Oct 14 is 01:00-04:00Z on Oct 15.
		expect(start).toBe('DTSTART:20261015T010000Z');
		expect(end).toBe('DTEND:20261015T040000Z');
		expect(buildICS(base)).not.toContain('TZID');
	});

	it('uses the right offset after DST ends', () => {
		// Nov 1 2026: PST (UTC-8). 18:00 is 02:00Z on Nov 2.
		const { start } = times({ ...base, date: '2026-11-01' });
		expect(start).toBe('DTSTART:20261102T020000Z');
	});

	it('follows the Event timezone, not the server or a hardcoded one', () => {
		const { start } = times({ ...base, timeZone: 'Europe/London' });
		// 18:00 BST (UTC+1) on Oct 14 is 17:00Z the same day.
		expect(start).toBe('DTSTART:20261014T170000Z');
	});

	it('puts DTEND on the NEXT day when the event runs past midnight', () => {
		// Without this DTEND would precede DTSTART, which calendars reject or mangle.
		const { start, end } = times({ ...base, startTime: '22:00', endTime: '01:00' });
		expect(start).toBe('DTSTART:20261015T050000Z'); // 22:00 PDT Oct 14
		expect(end).toBe('DTEND:20261015T080000Z'); //   01:00 PDT Oct 15
		expect(end > start.replace('DTSTART', 'DTEND')).toBe(true);
	});

	it('always ends at or after it starts', () => {
		for (const [s, e] of [['18:00', '21:00'], ['22:00', '01:00'], ['12:00', '12:00'], ['23:30', '00:15']]) {
			const { start, end } = times({ ...base, startTime: s, endTime: e });
			expect(end.slice('DTEND:'.length) >= start.slice('DTSTART:'.length)).toBe(true);
		}
	});
});

describe('buildICS — injection and escaping', () => {
	it('a name containing CRLF cannot start a new property or a second event', () => {
		const ics = buildICS({
			...base,
			name: 'Craft Night\r\nBEGIN:VEVENT\r\nSUMMARY:Pwned\r\nATTENDEE:mailto:evil@x.com'
		});
		const lines = logical(ics);

		expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
		expect(lines.some((l) => l.startsWith('ATTENDEE'))).toBe(false);
		expect(lines.filter((l) => l.startsWith('SUMMARY'))).toHaveLength(1);
		// The whole thing survives, escaped, on one SUMMARY line.
		expect(lines.find((l) => l.startsWith('SUMMARY'))).toContain('\\nBEGIN:VEVENT');
	});

	it('the same holds for location, description and url', () => {
		const ics = buildICS({
			...base,
			location: 'Studio\r\nATTENDEE:mailto:a@x.com',
			description: 'Notes\nATTENDEE:mailto:b@x.com',
			url: 'https://x.example/\r\nATTENDEE:mailto:c@x.com'
		});
		expect(logical(ics).some((l) => l.startsWith('ATTENDEE'))).toBe(false);
	});

	it('escapes commas and semicolons in the values that need it', () => {
		const lines = logical(
			buildICS({ ...base, name: 'Linocut, etching; and more', location: 'Room 4, Studio; Oakland' })
		);
		expect(lines).toContain('SUMMARY:Linocut\\, etching\\; and more');
		expect(lines).toContain('LOCATION:Room 4\\, Studio\\; Oakland');
	});

	it('does not escape commas in a URL (it is a URI, not TEXT)', () => {
		const lines = logical(buildICS({ ...base, url: 'https://x.example/a,b' }));
		expect(lines).toContain('URL:https://x.example/a,b');
	});

	it('folds a long description without breaking it', () => {
		const description = 'A long agenda item, with commas; and semicolons. '.repeat(20);
		const ics = buildICS({ ...base, description });

		for (const physical of ics.split('\r\n')) {
			expect(enc.encode(physical).length).toBeLessThanOrEqual(75);
		}
		expect(logical(ics).find((l) => l.startsWith('DESCRIPTION:'))).toBe(
			'DESCRIPTION:' + escapeText(description)
		);
	});
});
