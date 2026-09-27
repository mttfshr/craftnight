/**
 * Renders a JSON-LD <script type="application/ld+json"> tag as an HTML
 * string, for use with {@html}.
 *
 * Two separate hazards are handled here, and they are easy to confuse.
 *
 * 1. Building the tag. It is assembled by concatenation rather than a literal
 *    template string containing "<script...>...</script>". Svelte's compiler
 *    locates a file's script block(s) with a raw-text scan for that substring
 *    BEFORE it hands {@html} content to the JS parser; a literal occurrence
 *    inside our own template literal is indistinguishable to that scan from a
 *    real block boundary, and the JS parser then sees a truncated string and
 *    reports "Unterminated template". Splitting the tag name defeats the naive
 *    scan without changing the emitted HTML.
 *
 * 2. The payload. JSON.stringify does not escape "<", so a string value that
 *    contains "</script>" would end this element early and everything after it
 *    would be parsed as HTML. An event description of
 *    "</script><script>alert(1)</script>" would execute. "<", ">" and "&" are
 *    therefore emitted as \u003c, \u003e and \u0026 — still valid JSON, and any
 *    JSON parser decodes them back, but the HTML parser never sees a "<".
 *    U+2028/U+2029 are escaped too: valid in JSON, historically line
 *    terminators in JavaScript.
 */
export function renderJsonLd(data: unknown): string {
	const json = JSON.stringify(data)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');

	const open = '<' + 'script type="application/ld+json">';
	const close = '<' + '/script>';
	return open + json + close;
}
