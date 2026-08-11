<script lang="ts">
	// The aggregated calendar: every dated record across the system, in day /
	// week / month views. Sources are color-coded and clickable through to the
	// record; legend chips toggle sources on and off.
	import type { PageData } from './$types';
	import type { CalEntry } from './+page.server';
	import { Button } from '$lib/components/ui/button';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { data }: { data: PageData } = $props();

	const SOURCES: { key: CalEntry['module']; label: string; color: string }[] = [
		{ key: 'events', label: 'Events & shows', color: '#2f7d5b' },
		{ key: 'todos', label: 'Todos due', color: '#b3593a' },
		{ key: 'projects', label: 'Project deadlines', color: '#7d5ba6' },
		{ key: 'notes', label: 'Meetings & notes', color: '#3a6ea5' }
	];
	const colorOf = (m: CalEntry['module']) => SOURCES.find((s) => s.key === m)!.color;

	let mode = $state<'day' | 'week' | 'month'>('month');
	let hidden = $state<Record<string, boolean>>({});
	let showDone = $state(false);

	const todayISO = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	})();
	let cursor = $state(''); // YYYY-MM-DD anchor for the visible range
	$effect(() => {
		if (!cursor) cursor = todayISO;
	});

	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const parse = (s: string) => new Date(`${s}T00:00:00`);

	const visible = $derived(
		data.entries.filter((e) => !hidden[e.module] && (showDone || !e.done))
	);
	const byDate = $derived.by(() => {
		const map = new Map<string, CalEntry[]>();
		for (const e of visible) {
			const list = map.get(e.date);
			if (list) list.push(e);
			else map.set(e.date, [e]);
		}
		return map;
	});

	function shift(delta: number) {
		const d = parse(cursor || todayISO);
		if (mode === 'day') d.setDate(d.getDate() + delta);
		else if (mode === 'week') d.setDate(d.getDate() + delta * 7);
		else d.setMonth(d.getMonth() + delta);
		cursor = iso(d);
	}

	// Sunday-start week containing the cursor.
	const weekDays = $derived.by(() => {
		const d = parse(cursor || todayISO);
		d.setDate(d.getDate() - d.getDay());
		return Array.from({ length: 7 }, (_, i) => {
			const day = new Date(d);
			day.setDate(d.getDate() + i);
			return iso(day);
		});
	});

	// Month grid, whole Sunday-start rows.
	const monthWeeks = $derived.by(() => {
		const c = parse(cursor || todayISO);
		const first = new Date(c.getFullYear(), c.getMonth(), 1);
		const start = new Date(first);
		start.setDate(1 - first.getDay());
		const out: { iso: string; day: number; inMonth: boolean }[][] = [];
		const d = new Date(start);
		for (let w = 0; w < 6; w++) {
			const row = [];
			for (let i = 0; i < 7; i++) {
				row.push({ iso: iso(d), day: d.getDate(), inMonth: d.getMonth() === c.getMonth() });
				d.setDate(d.getDate() + 1);
			}
			out.push(row);
			if (d.getMonth() !== c.getMonth() && d > new Date(c.getFullYear(), c.getMonth() + 1, 0)) break;
		}
		return out;
	});

	const rangeLabel = $derived.by(() => {
		const d = parse(cursor || todayISO);
		if (mode === 'day')
			return d.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		if (mode === 'week') {
			const a = parse(weekDays[0]);
			const b = parse(weekDays[6]);
			const f = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			return `${f(a)} – ${f(b)}, ${b.getFullYear()}`;
		}
		return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	});

	const dayLabel = (s: string) =>
		parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// The Up Next rail: what's bearing down, regardless of which month page is
	// open. Overdue first (undone, slipped), then the next 60 days in order.
	const upNext = $derived.by(() => {
		const horizon = (() => {
			const d = parse(todayISO);
			d.setDate(d.getDate() + 60);
			return iso(d);
		})();
		const overdue = visible
			.filter((e) => !e.done && e.date < todayISO && e.module !== 'notes')
			.slice(-3)
			.map((e) => ({ e, overdue: true }));
		const ahead = visible
			.filter((e) => e.date >= todayISO && e.date <= horizon && !e.done)
			.slice(0, 9)
			.map((e) => ({ e, overdue: false }));
		return [...overdue, ...ahead];
	});
	const shortMD = (s: string) =>
		parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
	const daysLate = (s: string) =>
		Math.round((parse(todayISO).getTime() - parse(s).getTime()) / 86400000);
</script>

<svelte:head><title>base — calendar</title></svelte:head>

{#snippet entryRow(e: CalEntry, compact: boolean)}
	<a
		href={e.href}
		title={e.title}
		class="flex items-center gap-1.5 rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:bg-accent {e.done
			? 'opacity-50'
			: ''}"
	>
		<span class="size-1.5 shrink-0 rounded-full" style="background:{colorOf(e.module)};"></span>
		{#if e.time && !compact}<span class="shrink-0 font-mono text-[10px] text-muted-foreground">{e.time}</span>{/if}
		<span class="truncate">{e.title || '(untitled)'}</span>
	</a>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<PageHeader code="CAL" title="Calendar" subtitle="everything dated, one grid">
		{#snippet actions()}
			<!-- The category's drill-downs, mirrored from the rail: the show
			     sheets and the raw events table behind this grid. -->
			<a
				href="/shows"
				class="inline-flex items-center gap-2 rounded-[10px] border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent"
				>Shows</a
			>
			<a
				href="/events"
				class="inline-flex items-center gap-2 rounded-[10px] border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent"
				>Events</a
			>
		{/snippet}
	</PageHeader>

	<div class="mb-4 mt-6 flex flex-wrap items-center gap-3">
		<div class="inline-flex gap-0.5 rounded-[8px] bg-muted p-[3px]">
			{#each ['day', 'week', 'month'] as m (m)}
				<button
					type="button"
					onclick={() => (mode = m as typeof mode)}
					class="cursor-pointer rounded-[6px] px-3 py-1 text-[11px] font-semibold capitalize {mode === m
						? 'bg-primary text-primary-foreground'
						: 'text-foreground/70'}">{m}</button
				>
			{/each}
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => shift(-1)} aria-label="Previous">
				<ChevronLeft class="size-4" />
			</Button>
			<Button variant="outline" size="sm" onclick={() => shift(1)} aria-label="Next">
				<ChevronRight class="size-4" />
			</Button>
			<Button variant="ghost" size="sm" class="font-mono text-[11px]" onclick={() => (cursor = todayISO)}>
				Today
			</Button>
			<span class="font-mono text-sm tracking-tight">{rangeLabel}</span>
		</div>
		<div class="ml-auto flex flex-wrap items-center gap-1.5">
			{#each SOURCES as s (s.key)}
				<button
					type="button"
					onclick={() => (hidden[s.key] = !hidden[s.key])}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors {hidden[s.key]
						? 'opacity-40'
						: 'bg-card'}"
				>
					<span class="size-1.5 rounded-full" style="background:{s.color};"></span>{s.label}
				</button>
			{/each}
			<button
				type="button"
				onclick={() => (showDone = !showDone)}
				class="inline-flex cursor-pointer items-center rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors {showDone
					? 'bg-card'
					: 'opacity-40'}"
			>
				show completed
			</button>
		</div>
	</div>

	{#if data.apiError}
		<div class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	{#if mode === 'month'}
		<div class="grid items-start gap-4 lg:grid-cols-[1fr_264px]">
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="grid grid-cols-7 border-b">
				{#each DOW as d (d)}
					<div class="px-3 py-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">{d}</div>
				{/each}
			</div>
			{#each monthWeeks as week, wi (wi)}
				<div class="grid grid-cols-7 {wi > 0 ? 'border-t' : ''}">
					{#each week as cell (cell.iso)}
						{@const dayItems = byDate.get(cell.iso) ?? []}
						<div
							class="min-h-24 border-r p-1.5 last:border-r-0 {cell.inMonth ? '' : 'bg-muted/30'}
							{cell.iso === todayISO ? 'bg-signal/5' : ''}"
						>
							<button
								type="button"
								onclick={() => {
									cursor = cell.iso;
									mode = 'day';
								}}
								class="mb-1 cursor-pointer font-mono text-[10px] hover:text-signal {cell.iso === todayISO
									? 'font-semibold text-signal'
									: cell.inMonth
										? 'text-muted-foreground'
										: 'text-muted-foreground/50'}"
							>
								{cell.day}
							</button>
							<div class="flex flex-col gap-1">
								{#each dayItems.slice(0, 3) as e (e.id)}{@render entryRow(e, true)}{/each}
								{#if dayItems.length > 3}
									<button
										type="button"
										onclick={() => {
											cursor = cell.iso;
											mode = 'day';
										}}
										class="cursor-pointer px-1 text-left font-mono text-[10px] text-muted-foreground hover:text-signal"
									>
										+{dayItems.length - 3} more
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</div>

		<!-- What's bearing down — overdue pinned, then the next 60 days. -->
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-4 py-2.5">
				<span class="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
					>Up next</span
				>
				<span class="font-mono text-[10px] text-muted-foreground/70">next 60d</span>
			</div>
			<div class="divide-y">
				{#each upNext as u (u.e.id)}
					<a
						href={u.e.href}
						class="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-accent"
					>
						<span
							class="w-[52px] flex-none font-mono text-[9.5px] {u.overdue
								? 'text-destructive'
								: 'text-muted-foreground'}"
						>
							{u.overdue ? 'OVERDUE' : shortMD(u.e.date)}
						</span>
						<span
							class="size-1.5 flex-none rounded-full"
							style="background:{colorOf(u.e.module)};"
						></span>
						<span class="min-w-0 flex-1 truncate text-[12.5px]">
							{u.e.title || '(untitled)'}{u.overdue ? ` — ${daysLate(u.e.date)}d` : ''}
						</span>
					</a>
				{:else}
					<p class="px-4 py-3 font-mono text-xs text-muted-foreground">Nothing ahead.</p>
				{/each}
			</div>
		</div>
		</div>
	{:else if mode === 'week'}
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="grid grid-cols-7">
				{#each weekDays as d, i (d)}
					{@const dayItems = byDate.get(d) ?? []}
					<div class="flex min-h-[340px] flex-col border-r p-2 last:border-r-0 {d === todayISO ? 'bg-signal/5' : ''} {i > 0 ? '' : ''}">
						<button
							type="button"
							onclick={() => {
								cursor = d;
								mode = 'day';
							}}
							class="mb-2 cursor-pointer text-left font-mono text-[10px] tracking-[0.08em] hover:text-signal {d === todayISO
								? 'font-semibold text-signal'
								: 'text-muted-foreground'}"
						>
							{dayLabel(d).toUpperCase()}
						</button>
						<div class="flex flex-col gap-1">
							{#each dayItems as e (e.id)}{@render entryRow(e, false)}{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		{@const dayItems = byDate.get(cursor || todayISO) ?? []}
		<div class="max-w-3xl overflow-hidden rounded-[12px] border bg-card">
			<div class="divide-y">
				{#each dayItems as e (e.id)}
					<a
						href={e.href}
						class="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent {e.done
							? 'opacity-50'
							: ''}"
					>
						<span class="flex min-w-0 items-center gap-3">
							<span class="size-2 shrink-0 rounded-full" style="background:{colorOf(e.module)};"></span>
							<span class="w-[46px] flex-none font-mono text-[11px] text-muted-foreground">{e.time ?? '—'}</span>
							<span class="min-w-0 truncate text-sm font-medium">{e.title || '(untitled)'}</span>
						</span>
						{#if e.detail}
							<span class="shrink-0 font-mono text-[11px] text-muted-foreground">{e.detail}</span>
						{/if}
					</a>
				{:else}
					<p class="px-5 py-4 font-mono text-xs text-muted-foreground">Nothing on this day.</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
