<script lang="ts">
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import {
		STAGES,
		TODAY,
		dueInfo,
		progress,
		healthVM,
		stageOf,
		nextStage,
		type Project
	} from '$lib/projects/data';
	import Plus from '@lucide/svelte/icons/plus';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import SegmentedControl from '$lib/components/chrome/SegmentedControl.svelte';
	import SearchBox from '$lib/components/chrome/SearchBox.svelte';

	let { t }: { t: Tracker } = $props();

	const LIST_VIEWS = [
		{ value: 'board' as const, label: 'Board' },
		{ value: 'list' as const, label: 'List' },
		{ value: 'timeline' as const, label: 'Timeline' }
	];

	const columns = $derived(
		STAGES.map((st) => {
			const cards = t.filtered.filter((p) => p.status === st.key);
			return { ...st, count: cards.length, cards };
		})
	);

	// Timeline model — an 8-month window starting at the current month.
	const MN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
	const tlStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
	const tlEnd = new Date(TODAY.getFullYear(), TODAY.getMonth() + 8, 1);
	const tlSpan = tlEnd.getTime() - tlStart.getTime();
	function pos(iso: string) {
		const d = new Date(iso + 'T00:00:00');
		return Math.max(0, Math.min(100, ((d.getTime() - tlStart.getTime()) / tlSpan) * 100));
	}
	const months = (() => {
		const out: { label: string }[] = [];
		let c = new Date(tlStart);
		while (c < tlEnd) {
			out.push({ label: MN[c.getMonth()] + " '" + String(c.getFullYear()).slice(2) });
			c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
		}
		return out;
	})();
	const timelineRows = $derived(
		t.filtered
			.filter((p) => p.status !== 'Archive' && p.start && p.due)
			.map((p) => {
				const l = pos(p.start);
				const r = pos(p.due);
				return {
					p,
					left: l,
					width: Math.max(3, r - l),
					color: stageOf(p.status).color,
					milestones: (p.milestones || []).map((m) => ({ left: pos(m.date) }))
				};
			})
	);

	const kindLabel = (p: Project) => (p.year ? p.year + ' · ' : '') + p.kind;
</script>

<div class="px-9 pb-14 pt-7">
	<!-- Page header -->
	<PageHeader
		code="PROJ"
		title="Projects"
		subtitle={`${t.activeCount} active · ${t.projects.length} records`}
	>
		{#snippet actions()}
			<SegmentedControl
				items={LIST_VIEWS}
				value={t.listView}
				onchange={(v) => (t.listView = v)}
			/>
			<SearchBox value={t.query} oninput={(v) => (t.query = v)} />
			<button
				onclick={t.openNew}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] bg-primary px-[15px] py-[9px] text-[13px] font-semibold text-primary-foreground hover:opacity-90"
			>
				<Plus class="size-4" /> New
			</button>
		{/snippet}
	</PageHeader>

	<!-- BOARD -->
	{#if t.listView === 'board'}
		<div class="flex items-start gap-4 overflow-x-auto pb-3.5">
			{#each columns as col (col.key)}
				<div class="flex w-[254px] flex-none flex-col">
					<div class="flex items-center gap-2 px-1 pb-3">
						<span
							class="size-2 rounded-full"
							style="background:{col.color};"
						></span>
						<span
							class="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground/70">{col.key}</span
						>
						<span class="font-mono text-[11px] text-muted-foreground">{col.count}</span>
					</div>
					<div class="flex min-h-[80px] flex-col gap-2.5 rounded-[12px] bg-muted p-2.5">
						{#each col.cards as p (p.id)}
							{@const du = dueInfo(p.due, p.status)}
							{@const h = healthVM(p.health)}
							{@const pct = progress(p)}
							{@const nxt = nextStage(p.status)}
							<div
								role="button"
								tabindex="0"
								onclick={() => t.openProject(p.id)}
								onkeydown={(e) => e.key === 'Enter' && t.openProject(p.id)}
								class="cursor-pointer rounded-[10px] border bg-card p-[12px_13px] transition-shadow hover:border-ring/40 hover:shadow-[0_3px_12px_rgba(30,28,24,.07)]"
							>
								<div class="flex items-center justify-between gap-2">
									<span
										class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
										>{p.kind}</span
									>
									<span class="size-2 rounded-full" style="background:{stageOf(p.status).color};"></span>
								</div>
								<div class="mb-[11px] mt-[9px] text-[14.5px] font-semibold leading-[1.25]">{p.name}</div>
								<div class="h-[5px] overflow-hidden rounded-[3px] bg-muted">
									<div class="h-full" style="width:{pct}%;background:{stageOf(p.status).color};"></div>
								</div>
								<div class="mt-2.5 flex items-center justify-between">
									<span class="font-mono text-[11px]" style="color:{du.color};">{du.label}</span>
									<span class="inline-flex items-center gap-1.5 text-[11px]" style="color:{h.color};">
										<span class="size-1.5 rounded-full" style="background:{h.color};"></span>{h.label}
									</span>
								</div>
								<div
									role="button"
									tabindex="0"
									onclick={(e) => {
										e.stopPropagation();
										t.advance(p.id, nxt.key);
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.stopPropagation();
											t.advance(p.id, nxt.key);
										}
									}}
									class="mt-2.5 cursor-pointer border-t pt-[9px] font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground/70"
								>
									Move → {nxt.key}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- LIST -->
	{#if t.listView === 'list'}
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div
				class="flex border-b px-5 py-3 font-mono text-[10px] tracking-[0.12em] text-muted-foreground"
			>
				<span class="flex-1">NAME</span><span class="w-[150px]">STATUS</span><span
					class="w-[170px]">PROGRESS</span
				><span class="w-[110px]">DUE</span><span class="w-[96px]">HEALTH</span>
			</div>
			{#each t.filtered as p (p.id)}
				{@const du = dueInfo(p.due, p.status)}
				{@const h = healthVM(p.health)}
				{@const pct = progress(p)}
				{@const st = stageOf(p.status)}
				<div
					role="button"
					tabindex="0"
					onclick={() => t.openProject(p.id)}
					onkeydown={(e) => e.key === 'Enter' && t.openProject(p.id)}
					class="flex cursor-pointer items-center border-b px-5 py-3.5 last:border-b-0 hover:bg-accent"
				>
					<span class="min-w-0 flex-1"
						><span class="text-[14px] font-semibold">{p.name}</span>
						<span class="ml-1.5 font-mono text-[10px] text-muted-foreground">{kindLabel(p)}</span></span
					>
					<span class="w-[150px]"
						><span class="inline-flex items-center gap-1.5 text-[12px] text-foreground/70"
							><span class="size-[7px] rounded-full" style="background:{st.color};"></span>{p.status}</span
						></span
					>
					<span class="flex w-[170px] items-center gap-[9px] pr-5"
						><span class="h-1.5 flex-1 overflow-hidden rounded bg-muted"
							><span class="block h-full" style="width:{pct}%;background:{st.color};"></span></span
						><span class="w-[30px] font-mono text-[11px] text-muted-foreground">{pct}%</span></span
					>
					<span class="w-[110px] font-mono text-[12px]" style="color:{du.color};">{du.label}</span>
					<span class="w-[96px]"
						><span class="inline-flex items-center gap-1.5 text-[11px]" style="color:{h.color};"
							><span class="size-1.5 rounded-full" style="background:{h.color};"></span>{h.label}</span
						></span
					>
				</div>
			{/each}
		</div>
	{/if}

	<!-- TIMELINE -->
	{#if t.listView === 'timeline'}
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex border-b">
				<div
					class="w-[180px] flex-none px-4 py-[11px] font-mono text-[10px] tracking-[0.12em] text-muted-foreground"
				>
					PROJECT
				</div>
				<div class="flex flex-1">
					{#each months as m (m.label)}
						<div
							class="flex-1 border-l px-2 py-[11px] font-mono text-[10px] tracking-[0.08em] text-muted-foreground"
						>
							{m.label}
						</div>
					{/each}
				</div>
			</div>
			{#each timelineRows as row (row.p.id)}
				<div
					role="button"
					tabindex="0"
					onclick={() => t.openProject(row.p.id)}
					onkeydown={(e) => e.key === 'Enter' && t.openProject(row.p.id)}
					class="flex h-[46px] cursor-pointer items-center border-b last:border-b-0 hover:bg-accent"
				>
					<div class="w-[180px] flex-none truncate px-4 text-[13px] font-medium">{row.p.name}</div>
					<div class="relative h-full flex-1">
						<div
							class="absolute top-3 flex h-[22px] items-center overflow-hidden rounded-[6px] px-[9px]"
							style="left:{row.left}%;width:{row.width}%;background:{row.color};opacity:.88;"
						>
							<span class="whitespace-nowrap font-mono text-[10px] text-white">{row.p.status}</span>
						</div>
						{#each row.milestones as ms, i (i)}
							<div
								class="absolute top-[17px] size-[11px] rounded-full border-[2.5px] border-foreground bg-card"
								style="left:{ms.left}%;transform:translateX(-5.5px);"
							></div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
