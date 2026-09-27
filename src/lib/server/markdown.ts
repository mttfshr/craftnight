import { micromark } from 'micromark';

/**
 * Markdown rendering for Event and Instance descriptions (ADR-007, FR-038).
 *
 * Lives under $lib/server on purpose. SvelteKit refuses to bundle anything in
 * $lib/server into client code, so "descriptions are rendered on the server,
 * never in the browser" is enforced by the build rather than by convention —
 * and micromark stays out of the client bundle entirely. Routes render in
 * their `load` functions and pass HTML down as page data.
 *
 * Why no sanitizer: micromark's defaults are the security property. Raw HTML in
 * the source is encoded, not passed through (`allowDangerousHtml` is off), and
 * link/image URLs with unsafe protocols such as `javascript:` are neutralised
 * (`allowDangerousProtocol` is off). So nothing untrusted is ever stored as
 * markup or emitted as markup. Do NOT enable either option.
 */

/** Markdown source → HTML, or null when there is nothing to render. */
export function renderMarkdown(source: string | null | undefined): string | null {
	if (!source || !source.trim()) return null;
	return micromark(source);
}

// Block-level closers become line breaks so paragraphs and list items don't
// run together once the tags are stripped.
const BLOCK_END = /<\/(?:p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi;

export interface PlainTextOptions {
	/** Collapse all whitespace to single spaces — for <meta> tags. */
	singleLine?: boolean;
	/** Truncate at a word boundary and append an ellipsis. */
	maxLength?: number;
}

/**
 * Markdown source → plain text, for the ICS DESCRIPTION field, <meta
 * description>, og:description, and JSON-LD.
 *
 * Renders through micromark and strips tags rather than regexing the source,
 * so the markdown grammar is handled by the same parser that produces the page.
 * The tag-strip regex is safe here because micromark has already encoded any
 * `<` from user text as `&lt;`; every `<` left in its output is a real tag it
 * generated. The result is only ever placed in plain-text contexts, never
 * re-inserted as HTML.
 */
export function toPlainText(
	source: string | null | undefined,
	options: PlainTextOptions = {}
): string {
	if (!source || !source.trim()) return '';

	let text = micromark(source)
		.replace(/<li>/gi, '• ')
		.replace(BLOCK_END, '\n')
		.replace(/<[^>]+>/g, '')
		// micromark encodes exactly these four. &amp; goes last so that text
		// which literally contained "&lt;" isn't decoded twice.
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	if (options.singleLine) text = text.replace(/\s+/g, ' ');

	const { maxLength } = options;
	if (maxLength && text.length > maxLength) {
		const cut = text.slice(0, maxLength);
		const lastSpace = cut.lastIndexOf(' ');
		text = (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
	}

	return text;
}

/** Row plus its rendered description, as returned by route `load` functions. */
export type WithDescriptionHtml<T> = T & { descriptionHtml: string | null };

/** Attach `descriptionHtml` to a row that has a markdown `description`. */
export function withDescriptionHtml<T extends { description: string | null }>(
	row: T
): WithDescriptionHtml<T> {
	return { ...row, descriptionHtml: renderMarkdown(row.description) };
}
