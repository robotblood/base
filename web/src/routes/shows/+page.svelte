<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import { SHOW_STATUS, fmtMoney, settle, soldShort, tourTotals } from '$lib/projects/shows';

	let { data }: { data: PageData } = $props();

	const todayISO = new Date().toISOString().slice(0, 10);
	const upcoming = $derived(
		data.shows.filter((s) => (s.when ?? '').slice(0, 10) >= todayISO).reverse()
	);
	const past = $derived(data.shows.filter((s) => (s.when ?? '').slice(0, 10) < todayISO));

	// The run so far = shows with money on them, not shows in the past. A date
	// cutoff would hide a settled show that hasn't happened yet (on-sale
	// numbers land well before the date) and would count an unsettled one as
	// zero once it had.
	const settled = $derived(data.shows.filter((s) => s.show?.gross || s.show?.merch?.length));
	const totals = $derived(tourTotals(settled.map((s) => s.show ?? undefined)));
	const soldPct = $derived(
		totals.capacity ? Math.round((totals.sold / totals.capacity) * 100) : null
	);

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
			{#if s.show?.sold}<span title="tickets sold">{soldShort(s.show)}</span>{/if}
			{#if s.show?.gross}<span class="text-foreground/70" title="box office">{fmtMoney(settle(s.show).gross)}</span>{/if}
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
		{#if totals.gross || totals.merch}
			<!-- The run so far, totalled from played shows. Payout only counts
			     shows with deal terms set, so it reads low rather than wrong
			     while a tour is still being settled. -->
			<section class="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border bg-border sm:grid-cols-4">
				{#snippet tile(label: string, value: string, sub: string)}
					<div class="bg-card px-5 py-3.5">
						<div class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							{label}
						</div>
						<div class="mt-1 text-[22px] font-bold leading-none tracking-[-0.01em]">{value}</div>
						<div class="mt-1.5 font-mono text-[10.5px] text-muted-foreground">{sub}</div>
					</div>
				{/snippet}
				{@render tile(
					'Box office',
					fmtMoney(totals.gross),
					`${settled.length} of ${data.shows.length} show${data.shows.length === 1 ? '' : 's'}`
				)}
				{@render tile(
					'Tickets',
					totals.sold.toLocaleString('en-US'),
					soldPct != null ? `${soldPct}% of ${totals.capacity.toLocaleString('en-US')}` : 'no capacity set'
				)}
				{@render tile(
					'Merch',
					fmtMoney(totals.merch),
					totals.sold ? `${fmtMoney(Math.round(totals.merch / totals.sold))} per head` : '—'
				)}
				{@render tile('Payout', fmtMoney(totals.payout), 'shows with terms set')}
			</section>
		{/if}

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
