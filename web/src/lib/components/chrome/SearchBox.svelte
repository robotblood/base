<script lang="ts">
	// The bordered search field from the tracker. Used both as a controlled
	// input (tracker, client-side filtering) and inside a GET form (module
	// pages, server-side `q`) — hence plain props rather than a bound store.
	import Search from '@lucide/svelte/icons/search';

	let {
		value = '',
		name,
		placeholder = 'Search…',
		oninput
	}: {
		value?: string;
		name?: string; // set when submitted as part of a form
		placeholder?: string;
		oninput?: (v: string) => void;
	} = $props();
</script>

<div class="flex w-[210px] items-center gap-2 rounded-[9px] border bg-card px-3 py-2">
	<Search class="size-4 shrink-0 text-muted-foreground" />
	<input
		{name}
		{value}
		{placeholder}
		oninput={(e) => oninput?.(e.currentTarget.value)}
		class="w-full border-none bg-transparent text-[13px] text-foreground outline-none"
	/>
</div>
