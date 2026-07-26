<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import { SHOW_STATUS } from '$lib/projects/shows';

	let { data }: { data: PageData } = $props();

	const todayISO = new Date().toISOString().slice(0, 10);
	const upcoming = $derived(
		data.shows.filter((s) => (s.when ?? '').slice(0, 10) >= todayISO).reverse()
	);
	const past = $derived(data.shows.filter((s) => (s.when ?? '').slice(0, 10) < todayISO));

	const fmtDate = (v: string | null) =>
		v
			? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			: 'TBD';
	const statusColor = (s: string) => SHOW_STATUS[s]?.[0] ?? '#8a8a8a';
</script>

<svelte:head><title>base — shows</title></svelte:head>

{#snippet showRow(s: (typeof data.shows)[number])}
	<a
		href={`/shows/${s.id}`}
		class="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent"
	>
		<span class="flex min-w-0 items-center gap-4">
			<span class="w-[104px] flex-none font-mono text-[11px] text-signal">{fmtDate(s.when)}</span>
			<span class="min-w-0 truncate text-sm font-medium">{s.title || '(untitled)'}</span>
		</span>
		<span class="flex shrink-0 items-center gap-3 font-mono text-[11px] text-muted-foreground">
			{#if s.project}<span class="max-w-[160px] truncate">{s.project}</span>{/if}
			{#if s.location}<span>{s.location}</span>{/if}
			{#if s.status}
				<span class="inline-flex items-center gap-1.5">
					<span class="size-1.5 rounded-full" style="background:{statusColor(s.status)};"></span>
					{s.status}
				</span>
			{/if}
		</span>
	</a>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="SHOW"
		title="Shows"
		subtitle={`${upcoming.length} upcoming · ${past.length} played`}
	/>

	{#if data.apiError}
		<div class="mb-4 mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	<div class="mt-6 flex max-w-4xl flex-col gap-6">
		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="border-b px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				Upcoming
			</div>
			<div class="divide-y">
				{#each upcoming as s (s.id)}{@render showRow(s)}{:else}
					<p class="px-5 py-4 font-mono text-xs text-muted-foreground">
						No shows booked — add performance dates from a live show project's SHOWS card.
					</p>
				{/each}
			</div>
		</section>

		{#if past.length}
			<section class="overflow-hidden rounded-[12px] border bg-card">
				<div class="border-b px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Played
				</div>
				<div class="divide-y">
					{#each past as s (s.id)}{@render showRow(s)}{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
