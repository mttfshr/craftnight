<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Organizer Login</title>
</svelte:head>

<main style="max-width:360px; margin:6rem auto; padding:0 1.25rem;">
	<h1>Organizer Login</h1>
	<form method="POST" use:enhance>
		<label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
		{#if form?.error}
			<p class="notice-error">{form.error}</p>
		{/if}
		<button type="submit">Log in</button>
	</form>
</main>

<style>
	.notice-error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 0.65rem 1rem; border-radius: 6px; }
</style>
