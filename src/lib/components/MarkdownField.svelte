<script lang="ts">
	// ADR-007: a plain textarea. It's a real form control, so it submits with
	// JavaScript disabled — the Tiptap editor it replaces could not.
	let { name, value = '' }: { name: string; value?: string | null } = $props();
</script>

<textarea {name} rows="8" placeholder="Write something…" value={value ?? ''}></textarea>
<small>
	Markdown: <code>**bold**</code>, <code>*italic*</code>, <code>## Heading</code>,
	<code>- list item</code>, <code>[text](https://link)</code>. HTML is shown as text, not rendered.
</small>
