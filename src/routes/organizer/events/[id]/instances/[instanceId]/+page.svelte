<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { event, instance } = $derived(data);

	function formatDate(date: string): string {
		return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
		});
	}

	function formatTime(t: string): string {
		const [h, m] = t.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
	}
</script>

<svelte:head>
	<title>{event.name} — {instance.date} — Organizer</title>
</svelte:head>

<main>
	<a href="/organizer/events/{event.id}">← {event.name}</a>

	<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
		<h1>{formatDate(instance.date)}</h1>
		<a href="/organizer/events/{event.id}/instances/{instance.id}/edit" role="button" class="btn-secondary">Edit instance</a>
	</div>
	<p>{formatTime(instance.start_time)} – {formatTime(instance.end_time)}</p>
	{#if instance.location}<p>📍 {instance.location}</p>{/if}
	{#if instance.descriptionHtml}
		<!-- Server-rendered markdown; raw HTML in the source was escaped (ADR-007). -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html instance.descriptionHtml}
	{/if}

	<h2>Headcount</h2>
	<table>
		<thead>
			<tr><th>Yes</th><th>Maybe</th><th>No</th><th>No response</th></tr>
		</thead>
		<tbody>
			<tr>
				<td><strong>{data.rsvpCounts.yes}</strong></td>
				<td><strong>{data.rsvpCounts.maybe}</strong></td>
				<td><strong>{data.rsvpCounts.no}</strong></td>
				<td><strong>{data.rsvpCounts.noResponse}</strong></td>
			</tr>
		</tbody>
	</table>

	<h2>Subscribers ({data.subscribers.length})</h2>
	{#if data.subscribers.length === 0}
		<p>No subscribers yet.</p>
	{:else}
		<table>
			<thead>
				<tr><th>Name</th><th>Contact</th><th>RSVP</th></tr>
			</thead>
			<tbody>
				{#each data.subscribers as sub}
					<tr>
						<td>{sub.name}</td>
						<td>{sub.email ?? sub.phone ?? '—'}</td>
						<td class="rsvp-{sub.rsvpStatus ?? 'none'}">{sub.rsvpStatus ?? 'no response'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main { max-width: 720px; margin: 0 auto; padding: 1rem 1.25rem; }
	.btn-secondary { background: transparent; color: var(--text-color, #111); border: 1px solid var(--border, #ccc); }
	.rsvp-yes { color: #166534; font-weight: 500; }
	.rsvp-maybe { color: #92400e; font-weight: 500; }
	.rsvp-no { color: #991b1b; font-weight: 500; }
	.rsvp-none { color: #9ca3af; }
</style>
