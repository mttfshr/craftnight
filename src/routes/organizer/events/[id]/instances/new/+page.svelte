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
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
</style>
