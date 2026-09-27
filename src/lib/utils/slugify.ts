/**
 * Converts an event name into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric characters with hyphens,
 * and collapses consecutive hyphens.
 */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}
