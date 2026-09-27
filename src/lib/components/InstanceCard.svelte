<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Instance, Subscriber, Rsvp } from '$lib/db/schema';

	let {
		instance,
		subscriber,
		rsvp,
		eventSlug,
		accentColor,
		turnstileSiteKey,
		variant = 'confirmed',
		locked = false,
		error = null
	}: {
		// descriptionHtml is rendered server-side in the page's load(); this
		// component never touches markdown or a server module.
		instance: Instance & { descriptionHtml: string | null };
		subscriber: Subscriber | null;
		rsvp: Rsvp | undefined;
		eventSlug: string;
		accentColor: string;
		// From load()'s page data, not $env/static/public — see the comment in
		// events/[slug]/+page.server.ts on why this can't be a static env import.
		turnstileSiteKey: string;
		// 'proposed' is a date-poll candidate: tagged as such, and with no
		// calendar link, since a tentative date shouldn't go into anyone's
		// calendar (FR-049).
		variant?: 'confirmed' | 'proposed';
		// A candidate whose date passed unconfirmed. Its RSVPs are locked, so it
		// shows a note instead of a form that could only fail on submit.
		locked?: boolean;
		// The failure message from the last submit, if it was for THIS card.
		error?: string | null;
	} = $props();

	const dt = $derived(new Date(instance.date + 'T00:00:00'));
	const monthLabel = $derived(dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase());
	const dayNum = $derived(dt.getDate());
	const weekday = $derived(dt.toLocaleDateString('en-US', { weekday: 'long' }));

	function fmt(t: string): string {
		const [h, m] = t.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	const timeRange = $derived(`${fmt(instance.start_time)} – ${fmt(instance.end_time)}`);
	const currentStatus = $derived(rsvp?.status ?? null);
</script>

<article class="card" style="--accent: {accentColor}">

	<!-- Date block -->
	<div class="date-block">
		<span class="month">{monthLabel}</span>
		<span class="day">{dayNum}</span>
		<span class="weekday">{weekday}</span>
		{#if variant === 'proposed'}<span class="tag">Proposed</span>{/if}
	</div>

	<div class="card-meta">
		<span class="time">{timeRange}</span>
		{#if instance.location}
			<span class="location">· {instance.location}</span>
		{/if}
	</div>

	{#if instance.descriptionHtml}
		<div class="description">
			<!-- Server-rendered markdown; raw HTML in the source was escaped (ADR-007). -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html instance.descriptionHtml}
		</div>
	{/if}

	{#if variant === 'confirmed'}
		<a class="ics-link" href="/events/{eventSlug}/instances/{instance.id}/calendar.ics">
			Add to calendar ↓
		</a>
	{/if}

	<!-- RSVP -->
	<div class="rsvp-section">
		{#if error}
			<p class="notice-error" role="alert">{error}</p>
		{/if}
		{#if locked}
			<p class="locked-note">This date has passed, so RSVPs are closed.</p>
		{:else if subscriber}
			<p class="rsvp-greeting">Hey <strong>{subscriber.name}</strong> — are you coming?</p>
			<form method="POST" action="?/rsvp" use:enhance>
				<input type="hidden" name="instanceId" value={instance.id} />
				<div class="pill-row">
					<button type="submit" name="rsvp" value="yes" class="pill" class:selected={currentStatus === 'yes'}>Going</button>
					<button type="submit" name="rsvp" value="maybe" class="pill" class:selected={currentStatus === 'maybe'}>Maybe</button>
					<button type="submit" name="rsvp" value="no" class="pill" class:selected={currentStatus === 'no'}>Can't make it</button>
				</div>
			</form>
		{:else}
			<form method="POST" action="?/subscribe" use:enhance>
				<input type="hidden" name="instanceId" value={instance.id} />
				<div class="subscribe-fields">
					<input name="name" type="text" required placeholder="Your name" />
					<input name="email" type="email" placeholder="Email" />
					<input name="phone" type="tel" placeholder="Phone (if no email)" />
				</div>
				<p class="rsvp-greeting">Will you be there?</p>
				<div class="pill-row">
					<button type="submit" name="rsvp" value="yes" class="pill">Going</button>
					<button type="submit" name="rsvp" value="maybe" class="pill">Maybe</button>
					<button type="submit" name="rsvp" value="no" class="pill">Can't make it</button>
				</div>
				<!--
					One widget per first-time form. FR-045 originally put it only on
					the first card, but the first-time form renders on EVERY card for
					an unrecognized visitor, so a single widget left the other forms
					submitting without a token — and the action can't treat a missing
					token as a pass without being fail-open (FR-057). Returning guests
					still never see Turnstile: they get the ?/rsvp branch above.
				-->
				<div class="cf-turnstile" data-sitekey={turnstileSiteKey}></div>
			</form>
		{/if}
	</div>

</article>

<style>
	.card {
		border: 1px solid color-mix(in srgb, var(--accent) 25%, #ccc);
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.25rem;
	}

	/* ── Date block ── */
	.date-block {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.month {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--accent);
		text-transform: uppercase;
	}
	.day {
		font-size: 2rem;
		font-weight: 800;
		line-height: 1;
		color: inherit;
	}
	.weekday {
		font-size: 0.9rem;
		opacity: 0.6;
	}
	.tag {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--accent);
		border-radius: 999px;
		color: var(--accent);
	}
	.locked-note {
		margin: 0;
		font-size: 0.9rem;
		opacity: 0.7;
	}
	.notice-error {
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: #991b1b;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
	}

	/* ── Meta row ── */
	.card-meta {
		font-size: 0.875rem;
		opacity: 0.75;
		margin-bottom: 1rem;
	}
	.location { margin-left: 0.25rem; }

	/* ── Description ── */
	.description {
		font-size: 1rem;
		line-height: 1.65;
		margin-bottom: 0.75rem;
	}

	/* ── ICS link ── */
	.ics-link {
		font-size: 0.8rem;
		color: var(--accent);
		text-decoration: none;
		display: block;
		margin-bottom: 1.25rem;
		opacity: 0.8;
	}
	.ics-link:hover { opacity: 1; }

	/* ── RSVP section ── */
	.rsvp-section {
		border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
		padding-top: 1rem;
	}
	.rsvp-greeting {
		font-size: 0.9rem;
		margin: 0 0 0.6rem;
	}

	/* Subscribe fields */
	.subscribe-fields {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.subscribe-fields input {
		margin: 0;
		padding: 0.4rem 0.65rem;
		font-size: 0.875rem;
	}

	/* Pill buttons */
	.pill-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.pill {
		padding: 0.4rem 1rem;
		border-radius: 999px;
		border: 1.5px solid var(--accent);
		background: transparent;
		color: var(--accent);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		width: auto;
	}
	.pill:hover,
	.pill.selected {
		background: var(--accent);
		color: #fff;
	}
</style>
