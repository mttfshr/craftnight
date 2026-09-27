<script lang="ts">
	import { page } from '$app/state';
	import InstanceCard from '$lib/components/InstanceCard.svelte';
	import { renderJsonLd } from '$lib/utils/jsonld';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const {
		event,
		descriptionText,
		metaDescription,
		subscriber,
		upcomingInstances,
		pastInstances,
		rsvpsByInstance,
		turnstileSiteKey
	} = $derived(data);

	const firstUpcoming = $derived(upcomingInstances[0] ?? null);
	const unsubscribed = $derived(page.url.searchParams.get('unsubscribed') === '1');
	const showTurnstileScript = $derived(!subscriber && upcomingInstances.length > 0);
</script>

<svelte:head>
	<title>{event.name}</title>
	<meta name="description" content={metaDescription || event.name} />
	<meta property="og:title" content={event.name} />
	<meta property="og:description" content={metaDescription} />
	{#if event.cover_image_url}
		<meta property="og:image" content={event.cover_image_url} />
	{/if}
	<meta property="og:type" content="website" />
	{#if firstUpcoming}
		{@const jsonld = {
			'@context': 'https://schema.org',
			'@type': 'Event',
			name: event.name,
			description: descriptionText || undefined,
			startDate: `${firstUpcoming.date}T${firstUpcoming.start_time}`,
			endDate: `${firstUpcoming.date}T${firstUpcoming.end_time}`,
			location: firstUpcoming.location
				? { '@type': 'Place', name: firstUpcoming.location }
				: undefined,
			image: event.cover_image_url ?? undefined
		}}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html renderJsonLd(jsonld)}
	{/if}
	{#if showTurnstileScript}
		<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
	{/if}
</svelte:head>

{#if event.cover_image_url}
	<div class="cover-wrap">
		<img src={event.cover_image_url} alt={event.name} class="cover" />
	</div>
{/if}

<main class="content" style="--accent: {event.accent_color ?? '#e85d04'}">
	<h1>{event.name}</h1>

	{#if unsubscribed}
		<p class="notice-success">You've been unsubscribed. We hope to see you again!</p>
	{/if}

	{#if event.descriptionHtml}
		<!-- Server-rendered markdown; raw HTML in the source was escaped (ADR-007). -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html event.descriptionHtml}
	{/if}

	<!-- ── Upcoming ────────────────────────────────────────── -->
	<section class="section-upcoming">
		<h2>Upcoming</h2>

		{#if upcomingInstances.length === 0}
			<p><em>No upcoming dates scheduled yet. Check back soon.</em></p>
		{:else}
			{#each upcomingInstances as instance}
				<InstanceCard
					{instance}
					{subscriber}
					rsvp={rsvpsByInstance[instance.id]}
					eventSlug={event.slug}
					accentColor={event.accent_color ?? '#e85d04'}
					{turnstileSiteKey}
				/>
			{/each}
		{/if}
	</section>

	<!-- ── Past ───────────────────────────────────────────── -->
	<section class="section-past">
		<h2>Past events</h2>

		{#if pastInstances.length === 0}
			<p><em>No past events yet.</em></p>
		{:else}
			{#each pastInstances as instance}
				{@const dt = new Date(instance.date + 'T00:00:00')}
				{@const pastRsvp = rsvpsByInstance[instance.id]}
				<div class="past-instance">
					<span class="past-date">
						{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
					</span>
					{#if instance.location}
						<span class="past-location">· {instance.location}</span>
					{/if}
					{#if pastRsvp}
						<span class="rsvp-badge rsvp-badge--{pastRsvp.status}">
							{pastRsvp.status === 'yes' ? 'Went' : pastRsvp.status === 'maybe' ? 'Maybe' : 'Skipped'}
						</span>
					{/if}
				</div>
			{/each}
		{/if}
	</section>
</main>

<style>
	.cover-wrap { width: 100%; max-height: 320px; overflow: hidden; margin-bottom: 1rem; }
	.cover { width: 100%; height: 320px; object-fit: cover; display: block; }

	.content { max-width: 600px; margin: 0 auto; padding: 1rem 1.25rem 4rem; }

	.section-past { margin-top: 2.5rem; }

	.past-instance {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
		font-size: 0.9rem;
	}
	.past-date { font-weight: 500; }
	.past-location { opacity: 0.6; }

	.rsvp-badge {
		margin-left: auto;
		font-size: 0.75rem;
		padding: 0.15rem 0.6rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		opacity: 0.7;
	}

	.notice-success {
		color: #166534; background: #f0fdf4;
		border: 1px solid #bbf7d0; padding: 0.65rem 1rem; border-radius: 6px;
	}
</style>
