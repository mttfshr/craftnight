<script lang="ts">
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>New Instance — {data.event.name}</title>
</svelte:head>

<main style="max-width:560px; margin:0 auto; padding:1rem 1.25rem;">
	<a href="/organizer/events/{data.event.id}">← {data.event.name}</a>
	<h1>Add Instance</h1>

	<form method="POST">
		<label>Date *<input name="date" type="date" required /></label>

		<div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
			<label>Start Time *<input name="start_time" type="time" required /></label>
			<label>End Time *<input name="end_time" type="time" required /></label>
		</div>

		<label>Location <small>(optional)</small><input name="location" type="text" placeholder="The Craft Studio, 123 Main St" /></label>

		<label>
			Description / agenda <small>(optional)</small>
			<MarkdownField name="description" />
		</label>

		<label class="poll-toggle">
			<input name="proposed" type="checkbox" />
			<span>
				This is a proposed date <small>(part of a date poll)</small>
			</span>
		</label>
		<p class="poll-hint">
			Add two or more proposed dates and guests can RSVP to each. When you confirm one, the others
			are cancelled. Proposed dates don't get a calendar link until then.
		</p>

		{#if form?.error}
			<p class="notice-error">{form.error}</p>
		{/if}

		<div style="display:flex; gap:0.75rem; justify-content:flex-end;">
			<a href="/organizer/events/{data.event.id}" role="button" class="btn-secondary">Cancel</a>
			<button type="submit">Publish Instance</button>
		</div>
	</form>
</main>

<style>
	.poll-toggle { display: flex; align-items: center; gap: 0.5rem; }
	.poll-toggle input { width: auto; margin: 0; }
	.poll-hint { margin-top: -0.25rem; font-size: 0.85rem; opacity: 0.7; }
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
</style>
