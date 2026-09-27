<script lang="ts">
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const { event } = $derived(data);
</script>

<svelte:head>
	<title>Edit {event.name} — Craftnight</title>
</svelte:head>

<main style="max-width:560px; margin:0 auto; padding:1rem 1.25rem;">
	<a href="/organizer/events/{event.id}">← {event.name}</a>
	<h1>Edit Event</h1>

	<form method="POST" enctype="multipart/form-data">
		<label>Name *<input name="name" type="text" required value={event.name} /></label>
		<label>
			Description
			<MarkdownField name="description" value={event.description} />
		</label>
		<label>
			Accent Color
			<div style="display:flex; align-items:center; gap:0.75rem;">
				<input name="accent_color" type="color" value={event.accent_color ?? '#e85d04'} style="width:3rem; height:2.5rem; padding:0.2rem; cursor:pointer;" />
				<small>Used for buttons on the event page</small>
			</div>
		</label>
		<label>
			Cover Image
			{#if event.cover_image_url}
				<img src={event.cover_image_url} alt="" style="max-width:120px; border-radius:4px; display:block; margin-bottom:0.5rem;" />
			{/if}
			<input name="cover_image" type="file" accept="image/*" />
			<small>Leave blank to keep current image</small>
		</label>

		{#if form?.error}
			<p class="notice-error">{form.error}</p>
		{/if}

		<div style="display:flex; gap:0.75rem; justify-content:flex-end;">
			<a href="/organizer/events/{event.id}" role="button" class="btn-secondary">Cancel</a>
			<button type="submit">Save changes</button>
		</div>
	</form>
</main>

<style>
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
</style>
