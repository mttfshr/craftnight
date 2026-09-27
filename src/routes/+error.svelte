<script lang="ts">
	import { page } from '$app/state';
</script>

<main style="max-width:480px; margin:8rem auto; padding:0 1.25rem;">
	<h1>
		{#if page.status === 404}
			Page not found
		{:else}
			Something went wrong
		{/if}
	</h1>
	<p>Error {page.status}</p>
	{#if page.error?.message && page.status !== 404}
		<p>{page.error.message}</p>
	{/if}
	<a href="/">← Back to home</a>
</main>
