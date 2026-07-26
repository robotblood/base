<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ago,
		CHECK_LABELS,
		CHECK_LEVEL,
		LEVEL_COLOR,
		LEVEL_LABEL,
		LOG_LEVEL,
		type CheckPoint,
		type Level
	} from '$lib/admin';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const f = $derived(data.filters);
	const entries = $derived(data.entries);
	const series = $derived(Object.entries(data.checks.series).sort(([a], [b]) => a.localeCompare(b)));

	const counts = $derived({
		error: entries.filter((e) => e.level === 'error').length,
		warn: entries.filter((e) => e.level === 'warn').length
	});

	// Filters live in the URL so a view is linkable and survives a reload — and
	// so the server does the filtering rather than shipping the whole log and
	// hiding most of it in the browser.
	function setParam(key: string, value: string) {
		const next = new URLSearchParams(page.url.searchParams);
		if (value) next.set(key, value);
		else next.delete(key);
		goto(`?${next}`, { keepFocus: true, noScroll: true });
	}

	let search = $state('');
	$effect(() => {
		search = f.q;
	});

	let expanded = $state<number | null>(null);

	function windowLabel(h: number) {
		return h < 24 ? `${h}h` : h === 168 ? '7d' : h === 720 ? '30d' : `${h / 24}d`;
	}

	function time(iso: string) {
		const d = new Date(iso);
		return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function day(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	/** Most recent run last — the strip reads left to right as time passing. */
	function trail(points: CheckPoint[], max = 40): CheckPoint[] {
		return points.slice(-max);
	}

	const card = 'rounded-[12px] border bg-card';
	const cardHead =
		'flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground';
	const chip =
		'cursor-pointer rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors';
</script>

<svelte:head><title>base — admin · logs</title></svelte:head>

{#snippet dot(level: Level, size = 8)}
	<span
		class="inline-block shrink-0 rounded-full"
		style={`width:${size}px;height:${size}px;background:${LEVEL_COLOR[level]}`}
		title={LEVEL_LABEL[level]}
	></span>
{/snippet}

{#snippet chips(
	label: string,
	options: { value: string; label: string }[],
	active: string,
	key: string
)}
	<div class="flex items-center gap-1.5">
		<span class="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
			{label}
		</span>
		<div class="flex gap-0.5 rounded-[8px] bg-muted p-[3px]">
			{#each options as o (o.value)}
				<button
					type="button"
					class={`${chip} ${
						active === o.value ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:text-foreground'
					}`}
					onclick={() => setParam(key, o.value)}
				>
					{o.label}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="ADMIN / LOGS"
		title="System log"
		subtitle={`${entries.length} entries in the last ${windowLabel(f.hours)} · ${counts.error} errors · ${counts.warn} warnings`}
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={() => goto(page.url.href, { invalidateAll: true })}>
				<RefreshCw class="size-4" /> Refresh
			</Button>
		{/snippet}
	</PageHeader>

	{#if !data.apiReachable}
		<div class={`${card} mb-4 px-5 py-4`}>
			<p class="text-sm text-destructive">
				The API is unreachable, so the stored log can't be read.
			</p>
			<p class="mt-1 text-[12px] text-muted-foreground">
				The journal below still works — it comes from journald, not the database.
			</p>
		</div>
	{/if}

	<!-- Check history: the trend the health page can't show, since it only ever
	     holds one reading. -->
	{#if series.length}
		<div class={`${card} mb-4`}>
			<div class={cardHead}>
				<span>Check history — last {windowLabel(Math.max(f.hours, 24))}</span>
				<span class="normal-case tracking-normal">oldest to newest, left to right</span>
			</div>
			<div class="divide-y">
				{#each series as [name, points] (name)}
					{@const recent = trail(points)}
					{@const last = recent[recent.length - 1]}
					<div class="flex items-center gap-4 px-5 py-2">
						<span class="w-52 shrink-0 text-[13px]">{CHECK_LABELS[name] ?? name}</span>
						<div class="flex min-w-0 flex-1 flex-wrap gap-[3px]">
							{#each recent as p (p.at)}
								<span
									class="h-3.5 w-[6px] rounded-[2px]"
									style={`background:${LEVEL_COLOR[CHECK_LEVEL[p.status] ?? 'unknown']}`}
									title={`${day(p.at)} ${time(p.at)} — ${p.status}: ${p.message}`}
								></span>
							{/each}
						</div>
						<span class="w-24 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
							{last ? ago(last.at) : ''}
						</span>
					</div>
				{/each}
			</div>
			<p class="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
				Each bar is one run. Hover for the message it recorded.
			</p>
		</div>
	{/if}

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
		{@render chips(
			'View',
			[
				{ value: 'events', label: 'Events' },
				{ value: 'journal', label: 'Journal' }
			],
			f.view,
			'view'
		)}
		{#if f.view === 'events'}
			{@render chips(
				'Level',
				[
					{ value: '', label: 'All' },
					{ value: 'info', label: 'Info+' },
					{ value: 'warn', label: 'Warn+' },
					{ value: 'error', label: 'Errors' }
				],
				f.level,
				'level'
			)}
			{@render chips(
				'Source',
				[
					{ value: '', label: 'All' },
					...data.checks.sources.map((s) => ({ value: s, label: s }))
				],
				f.source,
				'source'
			)}
		{:else}
			{@render chips(
				'Unit',
				data.units.map((u) => ({ value: u.unit, label: u.label })),
				f.unit,
				'unit'
			)}
		{/if}
		{@render chips(
			'Window',
			data.windows.map((h) => ({ value: String(h), label: windowLabel(h) })),
			String(f.hours),
			'hours'
		)}
		{#if f.view === 'events'}
			<form
				class="flex items-center gap-1.5"
				onsubmit={(e) => {
					e.preventDefault();
					setParam('q', search);
				}}
			>
				<input
					bind:value={search}
					placeholder="Search messages…"
					class="w-52 rounded-[7px] border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-ring"
				/>
				{#if f.q}
					<Button variant="ghost" size="sm" onclick={() => setParam('q', '')}>Clear</Button>
				{/if}
			</form>
		{/if}
	</div>

	{#if f.view === 'journal'}
		<div class={card}>
			<div class={cardHead}>
				<span>journalctl --user -u {f.unit}</span>
				<span class="normal-case tracking-normal">{data.journal.lines.length} lines</span>
			</div>
			{#if data.journal.error}
				<p class="px-5 py-4 text-sm text-destructive">{data.journal.error}</p>
			{:else if data.journal.lines.length === 0}
				<p class="px-5 py-4 text-[13px] text-muted-foreground">Nothing logged for this unit.</p>
			{:else}
				<pre
					class="max-h-[32rem] overflow-auto px-5 py-4 font-mono text-[11px] leading-relaxed">{data.journal.lines.join(
						'\n'
					)}</pre>
			{/if}
			<p class="border-t px-5 py-2.5 text-[12px] text-muted-foreground">
				Raw process output. Application events — errors and check results — are on the Events tab,
				which is queryable and included in your backups.
			</p>
		</div>
	{:else if entries.length === 0}
		<div class={`${card} px-5 py-8 text-center`}>
			<p class="text-[13px] text-muted-foreground">
				Nothing matches these filters in the last {windowLabel(f.hours)}.
			</p>
		</div>
	{:else}
		<div class={card}>
			<div class="divide-y">
				{#each entries as e (e.id)}
					{@const lvl = LOG_LEVEL[e.level] ?? 'unknown'}
					{@const hasDetail = Object.keys(e.detail ?? {}).length > 0}
					<div>
						<button
							type="button"
							class="flex w-full items-baseline gap-3 px-5 py-2 text-left transition-colors hover:bg-accent"
							onclick={() => (expanded = expanded === e.id ? null : e.id)}
							disabled={!hasDetail}
						>
							<span class="shrink-0 translate-y-[3px]">{@render dot(lvl)}</span>
							<span class="w-20 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
								{time(e.at)}
							</span>
							<span class="w-12 shrink-0 font-mono text-[10px] uppercase text-muted-foreground/70">
								{e.source}
							</span>
							<span class="w-44 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
								{e.event}
							</span>
							<span class="min-w-0 flex-1 truncate text-[13px]">{e.message}</span>
							{#if hasDetail}
								<span class="shrink-0 font-mono text-[10px] text-muted-foreground/60">
									{expanded === e.id ? '−' : '+'}
								</span>
							{/if}
						</button>
						{#if expanded === e.id && hasDetail}
							<pre
								class="max-h-80 overflow-auto border-t bg-muted/40 px-5 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(
									e.detail,
									null,
									2
								)}</pre>
						{/if}
					</div>
				{/each}
			</div>
			<p class="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
				Showing {entries.length} · entries expire by level (errors 180d, warnings 60d, info 14d)
			</p>
		</div>
	{/if}
</div>
