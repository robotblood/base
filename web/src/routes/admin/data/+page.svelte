<script lang="ts">
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const total = $derived(data.groups.reduce((n, g) => n + g.total, 0));
	const setCount = $derived(data.groups.reduce((n, g) => n + g.sets.length, 0));
</script>

<svelte:head><title>base — admin · data</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="SYS"
		title="Data"
		subtitle={`${setCount} imported ${setCount === 1 ? 'database' : 'databases'} · ${total} rows, kept out of the sidebar`}
	/>

	<div class="mt-6 max-w-3xl">
		<p class="mb-5 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			These came out of the Notion export but don't have a module of their own yet. Every row keeps
			its original columns, so nothing is lost by waiting — when one of these earns a real place in
			the app, promoting it is a normal migration rather than a re-import.
		</p>

		{#each data.groups as g (g.key)}
			<section class="mb-4 overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
						{g.label}
					</span>
					<a
						href={`/${g.key}`}
						class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
					>
						{g.total} rows · browse
					</a>
				</div>

				{#if g.error}
					<p class="px-5 py-3.5 text-sm text-destructive">Could not load: {g.error}</p>
				{:else}
					<div class="divide-y">
						{#each g.sets as s (s.name)}
							<a
								href={`/${g.key}?view=group&group=collection&f.collection=${encodeURIComponent(s.name)}`}
								class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
							>
								<span class="min-w-0 truncate text-sm">{s.name}</span>
								<span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
									{s.count}
								</span>
							</a>
						{:else}
							<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">Nothing imported.</p>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<p class="rounded-[12px] border bg-card px-5 py-4 font-mono text-xs text-muted-foreground">
				No hidden modules — everything imported has a place in the sidebar.
			</p>
		{/each}
	</div>
</div>
