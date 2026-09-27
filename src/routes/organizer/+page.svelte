<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Events — Craftnight Organizer</title>
</svelte:head>

<main>
	<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
		<h1>Events</h1>
		<a href="/organizer/events/new" role="button">+ New Event</a>
	</div>

	{#if data.events.length === 0}
		<p>No events yet. <a href="/organizer/events/new">Create your first event →</a></p>
	{:else}
		<table>
			<tbody>
				{#each data.events as event}
					<tr>
						<td><a href="/organizer/events/{event.id}">{event.name}</a></td>
						<td><code>/events/{event.slug}</code></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<hr />

	<form method="POST" action="/organizer/logout">
		<button type="submit" class="btn-plain">Log out</button>
	</form>
</main>

<style>
	main { max-width: 720px; margin: 0 auto; padding: 1rem 1.25rem; }
	.btn-plain { background: none; border: none; color: var(--text-muted, #888); font-size: 0.875rem; cursor: pointer; padding: 0; }
	.btn-plain:hover { text-decoration: underline; }
</style>
