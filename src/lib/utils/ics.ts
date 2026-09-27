import { nextDay, zonedTimeToUtc } from './dates';

/**
 * iCalendar (RFC 5545) generation for a single event instance.
 *
 * Times are written as UTC instants (`...Z`) rather than as a TZID plus a
 * VTIMEZONE block. Each instance is one occurrence, so the instant is all a
 * calendar needs, every client agrees on it, and there is no timezone
 * definition to generate (FR-034, amended 2026-09-27). A guest in another zone
 * sees the event at the correct local time, which is what they want.
 *
 * This module takes plain strings and knows nothing about markdown or the
 * database; the route turns descriptions into plain text before calling it.
 */

export interface IcsInput {
	/** Stable per instance, so re-downloading updates rather than duplicates. */
	uid: string;
	name: string;
	/** Plain text — NOT markdown source and NOT HTML (FR-034). */
	description: string | null;
	location: string | null;
	/** Absolute URL back to the public event page. */
	url: string | null;
	/** `YYYY-MM-DD`, interpreted in `timeZone`. */
	date: string;
	/** `HH:MM`, interpreted in `timeZone`. */
	startTime: string;
	/** `HH:MM`. Earlier than `startTime` means the event ends after midnight. */
	endTime: string;
	/** IANA zone the wall-clock times are in — the Event's `timezone`. */
	timeZone: string;
	/** Injectable clock for DTSTAMP, so output is testable. */
	now?: Date;
}

/**
 * Escapes a TEXT value (SUMMARY, LOCATION, DESCRIPTION): backslash, semicolon
 * and comma are escaped and every newline flavour becomes a literal `\n`.
 *
 * Newlines matter for more than formatting. An unescaped CR/LF in a name would
 * end the property and let the rest of the value be read as a NEW property —
 * "Craft night\r\nBEGIN:VEVENT..." is injection into the calendar file. Other
 * control characters are dropped outright.
 */
export function escapeText(value: string): string {
	return value
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Folds a content line so no physical line exceeds 75 octets (RFC 5545 3.1).
 * Continuation lines begin with one space, which counts toward their 75.
 *
 * The limit is in OCTETS, not characters, so accented letters, CJK and emoji
 * take 2-4 each. Iterating with `for...of` walks code points, so a surrogate
 * pair is never split across a fold.
 */
export function foldLine(line: string): string {
	if (encoder.encode(line).length <= 75) return line;

	const physical: string[] = [];
	let current = '';
	let bytes = 0;
	let limit = 75;

	for (const char of line) {
		const size = encoder.encode(char).length;
		if (bytes + size > limit) {
			physical.push(current);
			current = '';
			bytes = 0;
			limit = 74; // the leading space of a continuation line takes one octet
		}
		current += char;
		bytes += size;
	}
	physical.push(current);

	return physical.join('\r\n ');
}

/** `Date` -> `20261015T010000Z` */
function formatUtc(date: Date): string {
	return date
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/[-:]/g, '');
}

/** Builds the `.ics` file body. CRLF line endings throughout, per the RFC. */
export function buildICS(input: IcsInput): string {
	const start = zonedTimeToUtc(input.date, input.startTime, input.timeZone);
	// An end time earlier than the start means the event runs past midnight; the
	// end is on the following calendar day. (Otherwise DTEND precedes DTSTART.)
	const endDate = input.endTime < input.startTime ? nextDay(input.date) : input.date;
	const end = zonedTimeToUtc(endDate, input.endTime, input.timeZone);

	const lines: (string | null)[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Craftnight//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${input.uid}@craftnight`,
		`DTSTAMP:${formatUtc(input.now ?? new Date())}`,
		`DTSTART:${formatUtc(start)}`,
		`DTEND:${formatUtc(end)}`,
		`SUMMARY:${escapeText(input.name)}`,
		input.location ? `LOCATION:${escapeText(input.location)}` : null,
		input.description ? `DESCRIPTION:${escapeText(input.description)}` : null,
		// URI values are not TEXT: no comma/semicolon escaping, but CR/LF are
		// stripped for the same injection reason as above.
		input.url ? `URL:${input.url.replace(/[\r\n]/g, '')}` : null,
		'END:VEVENT',
		'END:VCALENDAR'
	];

	return (
		lines
			.filter((line): line is string => line !== null)
			.map(foldLine)
			.join('\r\n') + '\r\n'
	);
}
