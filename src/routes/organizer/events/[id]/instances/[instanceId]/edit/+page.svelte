<script lang="ts">
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const { event, instance } = $derived(data);
</script>

<svelte:head>
	<title>Edit Instance — {event.name}</title>
</svelte:head>

<main class="edit-instance">
	<a href="/organizer/events/{event.id}/instances/{instance.id}">← {event.name} / {instance.date}</a>
	<h1>Edit Instance</h1>

	<form method="POST">
		<label>Date *<input name="date" type="date" required value={instance.date} /></label>

		<div class="time-row">
			<label>Start Time *<input name="start_time" type="time" required value={instance.start_time} /></label>
			<label>End Time *<input name="end_time" type="time" required value={instance.end_time} /></label>
		</div>

		<label>
			Location <small>(optional)</small>
			<input name="location" type="text" value={instance.location ?? ''} placeholder="The Craft Studio, 123 Main St" />
		</label>

		<label>
			Description / agenda <small>(optional)</small>
			<MarkdownField name="description" value={instance.description} />
		</label>

		{#if form?.error}
			<p class="notice-error">{form.error}</p>
		{/if}

		<div class="form-actions">
			<a href="/organizer/events/{event.id}/instances/{instance.id}" role="button" class="btn-secondary">Cancel</a>
			<button type="submit">Save changes</button>
		</div>
	</form>
</main>

<style>
	.edit-instance { max-width: 680px; margin: 0 auto; padding: 1rem 1.25rem; }

	.time-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1rem;
	}

	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
</style>
