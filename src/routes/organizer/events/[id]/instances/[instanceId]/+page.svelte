<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { event, instance } = $derived(data);

	// FR-014a: the organizer's real communication channel is manual texting, so
	// this list is a working tool. "Going" means yes or maybe.
	const going = $derived(
		data.subscribers.filter((s) => s.rsvpStatus === 'yes' || s.rsvpStatus === 'maybe')
	);
	const textable = $derived(going.filter((s) => s.phone));
	// Guests with only an email can't be reached by text — say so rather than
	// letting them silently drop off the list.
	const emailOnly = $derived(going.filter((s) => !s.phone));
	const phoneList = $derived(textable.map((s) => s.phone).join(', '));

	// The copy button needs JS and a secure context. It only renders after
	// mount, so without JS there is no dead button — just the selectable
	// textarea beside it.
	let canCopy = $state(false);
	let copied = $state(false);
	onMount(() => {
		canCopy = !!navigator.clipboard;
	});

	async function copyPhones() {
		try {
			await navigator.clipboard.writeText(phoneList);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard permission denied: the textarea is still selectable.
		}
	}

	/** Digits and a leading + only, for tel: hrefs. Display keeps what was typed. */
	function telHref(phone: string): string {
		return 'tel:' + phone.replace(/[^\d+]/g, '');
	}

	// Cancelling sends nobody a message (no notification channel, ADR-001), so
	// the dialog says how many people you'd have to tell.
	const cancelPrompt = $derived.by(() => {
		const going = data.rsvpCounts.yes + data.rsvpCounts.maybe;
		const who =
			going > 0
				? `${going} guest${going === 1 ? ' has' : 's have'} said going or maybe, and won't be told automatically — you'd need to text them. The list is on this page afterward.`
				: 'Nobody has said going or maybe yet.';
		return `Cancel ${instance.date}? It disappears from the public page and its calendar link stops working. ${who} This can't be undone.`;
	});

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
		<div class="header-actions">
			<a href="/organizer/events/{event.id}/instances/{instance.id}/edit" role="button" class="btn-secondary">Edit instance</a>
			{#if instance.status !== 'cancelled'}
				<form
					method="POST"
					action="?/cancel"
					onsubmit={(e) => {
						if (!confirm(cancelPrompt)) e.preventDefault();
					}}
				>
					<button type="submit" class="danger">Cancel this date</button>
				</form>
			{/if}
		</div>
	</div>
	{#if instance.status === 'cancelled'}
		<p class="status status-cancelled">
			Cancelled. It no longer appears on the public page and its calendar link no longer works.
			Its RSVPs are kept below for reference, and the list under “Text the group” is still here
			if you need to tell people.
		</p>
	{:else if instance.status === 'proposed'}
		<p class="status status-proposed">
			Proposed — part of a date poll and not confirmed yet.
			<a href="/organizer/events/{event.id}">Compare candidates</a>
		</p>
	{/if}
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

	<h2>Text the group</h2>
	{#if textable.length === 0}
		<p>No yes/maybe guests with a phone number yet.</p>
	{:else}
		<p>
			{textable.length} going or maybe, with a phone number. Paste into the To: field of a new message.
		</p>
		<textarea
			readonly
			rows="2"
			value={phoneList}
			aria-label="Phone numbers of guests who are going or maybe"
			onfocus={(e) => e.currentTarget.select()}
		></textarea>
		{#if canCopy}
			<button type="button" onclick={copyPhones}>{copied ? 'Copied ✓' : 'Copy numbers'}</button>
		{/if}
	{/if}
	{#if emailOnly.length > 0}
		<p><small>Going or maybe, but no phone number, so not on this list: {emailOnly.map((s) => s.name).join(', ')}</small></p>
	{/if}

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
						<td>
							{#if sub.phone}<a href={telHref(sub.phone)}>{sub.phone}</a>{/if}
							{#if sub.phone && sub.email}<br />{/if}
							{#if sub.email}<a href="mailto:{sub.email}">{sub.email}</a>{/if}
							{#if !sub.phone && !sub.email}—{/if}
						</td>
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
	.status { padding: 0.5rem 0.85rem; border-radius: 6px; font-size: 0.9rem; }
	.status-cancelled { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; }
	.status-proposed { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }
	.header-actions { display: flex; align-items: center; gap: 0.5rem; }
	.header-actions form { margin: 0; }
	.danger { background: transparent; color: #991b1b; border: 1px solid #991b1b; }
	.danger:hover { background: #fef2f2; }
</style>
