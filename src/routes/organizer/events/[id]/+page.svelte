<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { event, instances } = $derived(data);
</script>

<svelte:head>
	<title>{event.name} — Craftnight Organizer</title>
</svelte:head>

<main>
	<a href="/organizer">← Events</a>

	<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
		<h1>{event.name}</h1>
		<a href="/organizer/events/{event.id}/edit" role="button" class="btn-secondary">Edit event</a>
	</div>

	{#if event.cover_image_url}
		<img src={event.cover_image_url} alt={event.name} style="max-width:200px; border-radius:6px;" />
	{/if}

	{#if event.descriptionHtml}
		<!-- Server-rendered markdown; raw HTML in the source was escaped (ADR-007). -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html event.descriptionHtml}
	{/if}

	<p>
		Public URL: <a href="/events/{event.slug}" target="_blank"><code>/events/{event.slug}</code></a>
		{#if event.accent_color}
			&nbsp;<span style="display:inline-block; width:0.9rem; height:0.9rem; border-radius:50%; background:{event.accent_color}; vertical-align:middle; border:1px solid #ccc;"></span>
			<code>{event.accent_color}</code>
		{/if}
	</p>

	<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
		<h2>Instances</h2>
		<a href="/organizer/events/{event.id}/instances/new" role="button">+ Add Instance</a>
	</div>

	{#if instances.length === 0}
		<p>No instances yet. <a href="/organizer/events/{event.id}/instances/new">Add the first one →</a></p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Date</th>
					<th>Time</th>
					<th>Location</th>
				</tr>
			</thead>
			<tbody>
				{#each instances as instance}
					<tr>
						<td><a href="/organizer/events/{event.id}/instances/{instance.id}">{instance.date}</a></td>
						<td>{instance.start_time} – {instance.end_time}</td>
						<td>{instance.location ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main { max-width: 720px; margin: 0 auto; padding: 1rem 1.25rem; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
</style>
