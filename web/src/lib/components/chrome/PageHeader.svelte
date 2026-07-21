<script lang="ts">
	// The standard page masthead: patchbay code, title, a mono subtitle line,
	// and a right-hand actions area. Extracted from the Projects tracker so
	// every module page wears the same head.
	import type { Snippet } from 'svelte';

	let {
		code,
		title,
		subtitle,
		actions
	}: {
		code?: string;
		title: string;
		subtitle?: string;
		actions?: Snippet;
	} = $props();
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-5">
	<div>
		{#if code}
			<div class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">{code}</div>
		{/if}
		<h1 class="mb-1.5 mt-2 text-[31px] font-extrabold tracking-[-0.02em]">{title}</h1>
		{#if subtitle}
			<div class="font-mono text-[12px] text-muted-foreground">{subtitle}</div>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2.5">
			{@render actions()}
		</div>
	{/if}
</div>
