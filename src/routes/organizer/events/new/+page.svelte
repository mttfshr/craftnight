<script lang="ts">
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>New Event — Craftnight</title>
</svelte:head>

<main style="max-width:560px; margin:0 auto; padding:1rem 1.25rem;">
	<a href="/organizer">← Events</a>
	<h1>New Event</h1>

	<form method="POST" enctype="multipart/form-data">
		<label>Name *<input name="name" type="text" required placeholder="Tuesday Craft Night" /></label>
		<label>
			Description
			<MarkdownField name="description" />
		</label>
		<label>
			Accent Color
			<div style="display:flex; align-items:center; gap:0.75rem;">
				<input name="accent_color" type="color" value="#e85d04" style="width:3rem; height:2.5rem; padding:0.2rem; cursor:pointer;" />
				<small>Used for buttons on the event page</small>
			</div>
		</label>
		<label>Cover Image<input name="cover_image" type="file" accept="image/*" /></label>

		{#if form?.error}
			<p class="notice-error">{form.error}</p>
		{/if}

		<div style="display:flex; gap:0.75rem; justify-content:flex-end;">
			<a href="/organizer" role="button" class="btn-secondary">Cancel</a>
			<button type="submit">Create Event</button>
		</div>
	</form>
</main>

<style>
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
</style>
