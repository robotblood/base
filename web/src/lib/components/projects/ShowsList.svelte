<script lang="ts">
	// The Shows ledger (design handoff view 1a): every show on the tour as a
	// compact row — date block, venue/city, sold, status pill — expanding in
	// place to the logistics grid, with a jump to the full Show Details page.
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import type { Project, ProjEvent } from '$lib/projects/data';
	import {
		SHOW_STATUS,
		showDow,
		showDate,
		showMetrics,
		showStatus,
		showsOf,
		soldShort
	} from '$lib/projects/shows';
	import X from '@lucide/svelte/icons/x';

	let { t, p }: { t: Tracker; p: Project } = $props();

	const todayISO = new Date().toISOString().slice(0, 10);
	const shows = $derived(showsOf(p.events));
	const others = $derived(p.events.filter((e) => e.kind !== 'performance'));

	type Filter = 'Upcoming' | 'All' | 'Past';
	let filter = $state<Filter>('All');
	const visible = $derived(
		shows.filter((s) => {
			if (filter === 'All' || !s.when) return true;
			const past = s.when.slice(0, 10) < todayISO;
			return filter === 'Past' ? past : !past;
		})
	);
	function cycleFilter() {
		filter = filter === 'All' ? 'Upcoming' : filter === 'Upcoming' ? 'Past' : 'All';
	}

	// Expanded rows — the current/next show starts open.
	let open = $state<Record<string, boolean>>({});
	const nextShow = shows.find((s) => !s.when || s.when.slice(0, 10) >= todayISO);
	if (nextShow) open[nextShow.id] = true;

	let draft = $state({ venue: '', city: '', when: '' });
	function submit() {
		if (!draft.venue.trim()) return;
		void t.addEvent(p.id, draft.venue, draft.when, draft.city);
		draft = { venue: '', city: '', when: '' };
	}

	const contactOf = (ev: ProjEvent) =>
		ev.contactId ? t.directory.find((d) => d.id === ev.contactId)?.name : undefined;
	const idxOf = (ev: ProjEvent) => p.events.indexOf(ev);
</script>

<div class="overflow-hidden rounded-[14px] border bg-card">
	<div class="flex items-center justify-between p-[18px_20px_14px]">
		<span class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
			>Shows <span class="text-muted-foreground/70">· {shows.length}</span></span
		>
		<button
			onclick={cycleFilter}
			class="cursor-pointer font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70 hover:text-foreground/70"
			title="Cycle: All / Upcoming / Past">{filter} ▾</button
		>
	</div>

	{#each visible as ev (ev.id)}
		{@const st = showStatus(ev, todayISO)}
		{@const [sc, sb] = SHOW_STATUS[st] ?? SHOW_STATUS.Announced}
		{@const isOpen = !!open[ev.id]}
		{@const contact = contactOf(ev)}
		<div class="group/sh border-t border-border/70">
			<button
				onclick={() => (open[ev.id] = !open[ev.id])}
				class="grid w-full cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-[14px] px-5 py-[14px] text-left hover:bg-foreground/[0.02]"
			>
				<span class="flex flex-col leading-[1.1]">
					<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70"
						>{showDow(ev.when)}</span
					>
					<span class="font-mono text-[15px] font-semibold text-signal">{showDate(ev.when)}</span>
				</span>
				<span class="flex min-w-0 flex-col gap-[2px]">
					<span class="truncate text-[15px] font-semibold">{ev.title}</span>
					<span class="text-[12.5px] text-muted-foreground">{ev.location || '—'}</span>
				</span>
				<span class="flex items-center gap-[14px]">
					<span class="flex flex-col items-end leading-[1.15]">
						<span class="font-mono text-[12.5px] text-foreground/80">{soldShort(ev.show)}</span>
						<span class="font-mono text-[10px] text-muted-foreground/70">sold</span>
					</span>
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-[9px] py-1 font-mono text-[10.5px] uppercase tracking-[0.06em]"
						style="color:{sc};background:{sb};"
					>
						<span class="size-[6px] rounded-full" style="background:{sc};"></span>{st}
					</span>
					<span class="w-[14px] text-center font-mono text-[15px] text-muted-foreground/70"
						>{isOpen ? '–' : '+'}</span
					>
				</span>
			</button>

			{#if isOpen}
				{@const rest = [ev.phone, ev.address].filter(Boolean).join(' · ')}
				<div class="animate-in fade-in slide-in-from-top-1 p-[4px_20px_20px_78px] duration-200">
					<div
						class="mb-[14px] grid grid-cols-4 gap-px overflow-hidden rounded-[10px] border bg-border"
					>
						{#each showMetrics(ev.show, ev.show?.advance ?? '') as m (m.k)}
							<div class="flex flex-col gap-[3px] bg-muted p-[11px_13px]">
								<span class="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/70"
									>{m.k}</span
								>
								<span class="font-mono text-[14px]">{m.v}</span>
							</div>
						{/each}
					</div>
					<div class="flex flex-wrap items-center justify-between gap-2.5">
						<div class="min-w-0 text-[12.5px] text-muted-foreground">
							{#if contact || rest}
								{#if contact}<a
										href="/people/{ev.contactId}"
										class="text-foreground/80 hover:underline">{contact}</a
									>{/if}{#if contact && rest}{' · '}{/if}{rest}
							{:else}
								<span class="text-muted-foreground/60">No contact yet</span>
							{/if}
						</div>
						<span class="flex flex-none items-center gap-3">
							<a
								href="/shows/{ev.id}"
								class="font-mono text-[11px] uppercase tracking-[0.08em] text-signal hover:opacity-80"
								>Open details →</a
							>
							<button
								onclick={() => t.removeEvent(p.id, idxOf(ev))}
								title="Delete this show (the event record itself)"
								class="hidden flex-none cursor-pointer text-muted-foreground hover:text-destructive group-hover/sh:block"
								><X class="size-3.5" /></button
							>
						</span>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="border-t border-border/70 px-5 py-4 text-[13px] text-muted-foreground">
			{shows.length ? `No ${filter.toLowerCase()} shows.` : 'No shows yet — book the first date below.'}
		</div>
	{/each}

	<div class="flex items-center gap-2.5 border-t border-border/70 p-[14px_20px]">
		<input
			bind:value={draft.venue}
			onkeydown={(e) => e.key === 'Enter' && submit()}
			placeholder="Add a show — venue…"
			class="min-w-0 flex-1 rounded-[9px] border bg-background px-[13px] py-[9px] text-[13.5px] outline-none focus:border-ring"
		/>
		<input
			bind:value={draft.city}
			onkeydown={(e) => e.key === 'Enter' && submit()}
			placeholder="city"
			class="w-[110px] flex-none rounded-[9px] border bg-background px-[13px] py-[9px] text-[13.5px] outline-none focus:border-ring"
		/>
		<input
			type="datetime-local"
			bind:value={draft.when}
			aria-label="When"
			class="w-[180px] flex-none rounded-[9px] border bg-background px-2 py-[9px] font-mono text-[11px] text-muted-foreground outline-none focus:border-ring"
		/>
		<button
			onclick={submit}
			disabled={!draft.venue.trim()}
			class="cursor-pointer rounded-[9px] border bg-secondary px-[18px] py-[9px] text-[13.5px] font-semibold text-foreground/80 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
			>Add</button
		>
	</div>
</div>

{#if others.length}
	<!-- Non-performance dates (deadlines, meetings) keep a quiet list below. -->
	<div class="mt-4 rounded-[12px] border bg-card p-[14px_20px]">
		<div class="mb-1 font-mono text-[11px] tracking-[0.12em] text-muted-foreground">OTHER DATES</div>
		{#each others as ev (ev.id)}
			<div class="flex items-center gap-3 border-t py-2 first:border-t-0">
				<span class="w-[92px] flex-none font-mono text-[11px] text-foreground/70"
					>{showDate(ev.when)}</span
				>
				<a href="/events/{ev.id}" class="min-w-0 flex-1 truncate text-[14px] hover:underline"
					>{ev.title}</a
				>
				{#if ev.kind === 'deadline'}
					<span
						class="flex-none rounded-full bg-accent px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.05em] text-destructive"
						>deadline</span
					>
				{/if}
			</div>
		{/each}
	</div>
{/if}
