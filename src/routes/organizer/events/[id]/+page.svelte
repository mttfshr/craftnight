<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { event, proposed, instances } = $derived(data);

	function confirmPrompt(date: string, others: number) {
		return others > 0
			? `Confirm ${date}? The other ${others} proposed date${others === 1 ? '' : 's'} will be cancelled and disappear from the public page. This can't be undone.`
			: `Confirm ${date}?`;
	}
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

	{#if proposed.length > 0}
		<section class="poll">
			<h2>Proposed dates</h2>
			<p class="poll-hint">
				Guests can RSVP to each of these. Confirm one and the rest are cancelled.
			</p>

			{#if form?.confirmError}
				<p class="notice-error">{form.confirmError}</p>
			{/if}

			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th>Time</th>
						<th class="num">Yes</th>
						<th class="num">Maybe</th>
						<th class="num">No</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each proposed as candidate}
						<tr>
							<td><a href="/organizer/events/{event.id}/instances/{candidate.id}">{candidate.date}</a></td>
							<td>{candidate.start_time} – {candidate.end_time}</td>
							<td class="num yes">{candidate.tally.yes}</td>
							<td class="num maybe">{candidate.tally.maybe}</td>
							<td class="num no">{candidate.tally.no}</td>
							<td>
								<form
									method="POST"
									action="?/confirmInstance"
									onsubmit={(e) => {
										if (!confirm(confirmPrompt(candidate.date, proposed.length - 1))) e.preventDefault();
									}}
								>
									<input type="hidden" name="instanceId" value={candidate.id} />
									<button type="submit">Confirm this date</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
		<h2>Instances</h2>
		<a href="/organizer/events/{event.id}/instances/new" role="button">+ Add Instance</a>
	</div>

	{#if instances.length === 0 && proposed.length === 0}
		<p>No instances yet. <a href="/organizer/events/{event.id}/instances/new">Add the first one →</a></p>
	{:else if instances.length === 0}
		<p><em>No confirmed dates yet — confirm one of the proposed dates above.</em></p>
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
					<tr class:cancelled={instance.status === 'cancelled'}>
						<td>
							<a href="/organizer/events/{event.id}/instances/{instance.id}">{instance.date}</a>
							{#if instance.status === 'cancelled'}<span class="badge">Cancelled</span>{/if}
						</td>
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

	.poll { margin: 1.5rem 0; padding: 0.25rem 1rem 0.75rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
	.poll-hint { margin-top: -0.25rem; font-size: 0.85rem; opacity: 0.7; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.yes { color: #166534; font-weight: 600; }
	.maybe { color: #92400e; font-weight: 600; }
	.no { color: #991b1b; font-weight: 600; }
	.poll form { margin: 0; }

	.cancelled td { opacity: 0.55; }
	.badge { margin-left: 0.4rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.45rem; border: 1px solid currentColor; border-radius: 999px; }
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
</style>
