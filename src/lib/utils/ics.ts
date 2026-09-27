import type { Event, Instance } from '$lib/db/schema';

/**
 * Formats a YYYY-MM-DD date and HH:MM time into ICS local datetime format.
 * e.g. "2025-06-14" + "19:00" → "20250614T190000"
 */
function formatDT(date: string, time: string): string {
	return date.replace(/-/g, '') + 'T' + time.replace(/:/g, '').slice(0, 6);
}

/**
 * Builds an ICS calendar string for a single event instance.
 * Uses local time (no Z suffix) per spec.
 */
export function buildICS(event: Event, instance: Instance): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Craftnight//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${instance.id}@craftnight`,
		`SUMMARY:${event.name}`,
		`DTSTART:${formatDT(instance.date, instance.start_time)}`,
		`DTEND:${formatDT(instance.date, instance.end_time)}`,
		instance.location ? `LOCATION:${instance.location}` : null,
		event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : null,
		'END:VEVENT',
		'END:VCALENDAR'
	]
		.filter(Boolean)
		.join('\r\n');

	return lines + '\r\n';
}
