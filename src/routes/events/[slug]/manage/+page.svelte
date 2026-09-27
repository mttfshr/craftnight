<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { event, subscriber } = $derived(data);

	let confirmingUnsubscribe = $state(false);
</script>

<svelte:head>
	<title>Manage Subscription — {event.name}</title>
</svelte:head>

<main>
	<a href="/events/{event.slug}">← {event.name}</a>
	<h1>Manage Subscription</h1>

	{#if form?.updated}
		<p class="notice-success">Your details have been updated.</p>
	{/if}
	{#if form?.error}
		<p class="notice-error">{form.error}</p>
	{/if}

	<form method="POST" action="?/update" use:enhance>
		<h2>Your details</h2>
		<label>Name *<input name="name" type="text" value={subscriber.name} required /></label>
		<label>Email<input name="email" type="email" value={subscriber.email ?? ''} placeholder="jane@example.com" /></label>
		<label>Phone<input name="phone" type="tel" value={subscriber.phone ?? ''} placeholder="+1 555 000 0000" /></label>
		<button type="submit">Save changes</button>
	</form>

	<hr />

	<h2>Unsubscribe</h2>
	<p>You'll stop receiving notifications for <strong>{event.name}</strong>. This can't be undone.</p>

	{#if confirmingUnsubscribe}
		<form method="POST" action="?/unsubscribe" use:enhance>
			<p>Are you sure?</p>
			<button type="submit" class="btn-danger">Yes, unsubscribe me</button>
			<button type="button" onclick={() => confirmingUnsubscribe = false}>Cancel</button>
		</form>
	{:else}
		<button type="button" class="btn-danger" onclick={() => confirmingUnsubscribe = true}>
			Unsubscribe
		</button>
	{/if}
</main>

<style>
	main { max-width: 520px; margin: 0 auto; padding: 1rem 1.25rem 4rem; }

	.notice-success { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.65rem 1rem; border-radius: 6px; }
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }

	.btn-danger { background: #dc2626; border-color: #dc2626; }
	.btn-danger:hover { background: #b91c1c; border-color: #b91c1c; }
</style>
