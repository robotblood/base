<script lang="ts">
	// Overview, organised by *thread*: the handful of projects actually in
	// flight, each showing its own state, rather than one big todo list sliced
	// four ways by status. Live-show threads get a wide block with their dates
	// and advance state; everything else is a compact card with its next phase.
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { NoteBrief, Thread, ThreadShow, TodoBrief } from '$lib/types';
	import { getModule } from '$lib/modules';
	import { kindInfo } from '$lib/projects/kinds';
	import { ADVANCE_STYLE } from '$lib/projects/shows';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import ListMusic from '@lucide/svelte/icons/list-music';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import Plus from '@lucide/svelte/icons/plus';

	// The dashboard shows todo briefs rather than full records, so it borrows
	// the todos module config purely for its status colour vocabulary.
	const todosMod = getModule('todos')!;

	let { data }: { data: PageData } = $props();
	const d = $derived(data.dashboard);
	const today = $derived(d?.today ?? '');

	const days = (iso: string | null | undefined): number | null => {
		if (!iso || !today) return null;
		return Math.round(
			(new Date(iso.slice(0, 10) + 'T00:00:00').getTime() -
				new Date(today + 'T00:00:00').getTime()) /
				86400000
		);
	};
	function relDay(iso: string | null): { label: string; overdue: boolean } {
		const day = days(iso);
		if (day == null) return { label: '', overdue: false };
		if (day === 0) return { label: 'today', overdue: false };
		if (day === 1) return { label: 'tomorrow', overdue: false };
		if (day < 0) return { label: day === -1 ? 'yesterday' : `${-day}d ago`, overdue: true };
		return { label: `in ${day}d`, overdue: false };
	}

	const todayLabel = $derived(
		today
			? new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	// Threads that carry dates render as the wide block; the rest are cards.
	const dated = $derived((d?.threads ?? []).filter((t) => t.shows.length));
	const plain = $derived((d?.threads ?? []).filter((t) => !t.shows.length));

	// The headline is the single most pressing fact, not a sum of buckets: a
	// thread that has slipped its due date beats a date coming up, which beats
	// a bare count of what's in flight.
	const headline = $derived.by(() => {
		if (!d) return null;
		const withDue = d.threads
			.map((t) => ({ t, day: days(t.due) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null);
		const late = withDue.filter((x) => x.day < 0).sort((a, b) => a.day - b.day)[0];
		if (late)
			return { name: late.t.name, tail: `was due ${relDay(late.t.due).label}`, late: true };
		const next = dated
			.map((t) => ({ t, day: days(t.opens_at) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null)
			.sort((a, b) => a.day - b.day)[0];
		if (next)
			return {
				name: next.t.name,
				tail: next.day === 0 ? 'opens today' : `opens in ${next.day} days`,
				late: false
			};
		const soon = withDue.sort((a, b) => a.day - b.day)[0];
		if (soon) return { name: soon.t.name, tail: `due ${relDay(soon.t.due).label}`, late: false };
		return null;
	});

	const quickBtn =
		'inline-flex cursor-pointer items-center gap-2 rounded-[12px] border bg-card px-4 py-3 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent';
	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';

	const advanceStyle = (s: ThreadShow) => ADVANCE_STYLE[s.advance ?? 'Pending'] ?? ADVANCE_STYLE.Pending;

	// "Sep 28" — the overview wants the date at a glance; door and set times
	// live on the show page where they're actually used.
	const shortDate = (iso: string | null) => {
		if (!iso) return 'TBD';
		const dt = new Date(iso.length <= 10 ? `${iso}T00:00` : iso);
		return isNaN(dt.getTime())
			? 'TBD'
			: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};
	// An unrecognised kind still says more than the generic fallback label, so
	// legacy import kinds ("mixed") show themselves rather than "Project".
	function kindLabel(kind: string | null): string {
		const info = kindInfo(kind ?? undefined);
		return info.key === 'project' && kind ? kind : info.label;
	}
	// Rollups worth showing — a thread with nothing attached says so once,
	// rather than printing three zeroes.
	function rollup(t: Thread): string {
		const bits = [
			t.counts.tasks ? `${t.counts.tasks} open task${t.counts.tasks === 1 ? '' : 's'}` : '',
			t.counts.notes ? `${t.counts.notes} note${t.counts.notes === 1 ? '' : 's'}` : '',
			t.counts.shows ? `${t.counts.shows} show${t.counts.shows === 1 ? '' : 's'}` : ''
		].filter(Boolean);
		return bits.length ? bits.join(' · ') : 'nothing attached yet';
	}
</script>

<svelte:head><title>base — overview</title></svelte:head>

{#snippet todoRow(t: TodoBrief)}
	<a
		href={`/todos/${t.id}`}
		class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="min-w-0 truncate text-sm">{t.title}</span>
		<span class="flex shrink-0 items-center gap-2 font-mono text-[11px]">
			{#if t.due}
				{@const r = relDay(t.due)}
				<span class={r.overdue ? 'text-destructive' : 'text-muted-foreground'}>{r.label}</span>
			{/if}
			{#if t.status}
				<StatusDot mod={todosMod} value={t.status} showLabel />
			{/if}
		</span>
	</a>
{/snippet}

{#snippet noteRow(n: NoteBrief)}
	<a
		href={`/notes/${n.id}`}
		class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="min-w-0 truncate text-sm">{n.title}</span>
		<span class="flex shrink-0 items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
			{#if n.kind && n.kind !== 'note'}<span class="uppercase tracking-[0.06em]">{n.kind}</span>{/if}
			<span>{relDay(n.updated_at).label}</span>
		</span>
	</a>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<div class="mb-6">
		<div class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
			{todayLabel.toUpperCase()} — OPERATOR CONSOLE
		</div>
		<h1 class="mb-1.5 mt-2 text-[31px] font-extrabold tracking-[-0.02em]">
			{#if !d}
				System offline.
			{:else if headline}
				{headline.name}
				<span class={headline.late ? 'text-destructive' : 'text-signal'}>{headline.tail}</span>.
			{:else if d.threads.length}
				{d.threads.length}
				{d.threads.length === 1 ? 'thread' : 'threads'} in flight.
			{:else}
				Nothing in flight.
			{/if}
		</h1>
	</div>

	<!-- Quick start: one click from logged-in to working. -->
	<div class="mb-6 flex flex-wrap items-stretch gap-2.5">
		<form method="POST" action="?/weekly" use:enhance>
			<button
				type="submit"
				class={quickBtn}
				title={`Open (or start) this week's running note — week of ${data.weekOf}`}
			>
				<NotebookPen class="size-4 text-signal" /> Weekly note
				<span class="font-mono text-[10px] font-normal text-muted-foreground">
					wk of {new Date(data.weekOf + 'T00:00:00').toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric'
					})}
				</span>
			</button>
		</form>
		{#if data.latestShow}
			<a
				href={`/projects?open=${data.latestShow.id}&tab=rundown`}
				class={quickBtn}
				title={`Open the rundown for ${data.latestShow.name}`}
			>
				<ListMusic class="size-4" style="color:#7d5ba6;" /> New song
				<span class="max-w-[140px] truncate font-mono text-[10px] font-normal text-muted-foreground"
					>{data.latestShow.name}</span
				>
			</a>
		{/if}
		<a href="/projects?new=1" class={quickBtn} title="Start a new project">
			<FolderPlus class="size-4" style="color:#2f7d5b;" /> New project
		</a>
		<form
			method="POST"
			action="?/capture"
			use:enhance
			class="flex min-w-[240px] flex-1 items-center gap-2 rounded-[12px] border bg-card px-3 py-1.5 focus-within:border-ring"
		>
			<Plus class="size-4 flex-none text-muted-foreground" />
			<input
				name="title"
				placeholder="Quick capture — get it out of your head…"
				autocomplete="off"
				class="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-muted-foreground"
			/>
			<button
				type="submit"
				class="cursor-pointer rounded-[8px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
				>Add</button
			>
		</form>
	</div>

	{#if data.apiError}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	<!-- This week's running note — the "## Tasks" checklist from the weekly. -->
	{#if data.weekNote}
		{@const open = data.weekNote.tasks.filter((t) => !t.done)}
		{@const done = data.weekNote.tasks.length - open.length}
		<div class="mb-4 overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>This week</span>
				<a
					href={`/notes/${data.weekNote.id}`}
					class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
				>
					{done}/{data.weekNote.tasks.length} done · open note
				</a>
			</div>
			<div class="divide-y">
				{#each open as t (t.text)}
					<a
						href={`/notes/${data.weekNote.id}`}
						class="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
					>
						<span class="size-3.5 flex-none rounded-[4px] border border-input"></span>
						<span class="min-w-0 truncate text-sm">{t.text}</span>
					</a>
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						{data.weekNote.tasks.length
							? 'All of this week’s tasks are done.'
							: 'No tasks yet — add checkboxes under "## Tasks" in the weekly note.'}
					</p>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Dated threads (live shows): the run, with advance state per date. -->
	{#each dated as t (t.id)}
		{@const opens = days(t.opens_at)}
		<div class="mb-4 overflow-hidden rounded-[12px] border bg-card">
			<div class="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
				<a href={`/projects?open=${t.id}`} class="flex items-center gap-2.5 hover:opacity-80">
					<span class={cardLabel}>{t.name}</span>
					{#if t.next_action}
						<span class="font-mono text-[10px] uppercase tracking-[0.06em] text-signal"
							>{t.next_action}</span
						>
					{/if}
				</a>
				<span class="font-mono text-[11px] text-muted-foreground">
					{#if opens != null}
						{opens < 0 ? 'under way' : opens === 0 ? 'opens today' : `opens in ${opens} days`} ·
					{/if}
					{t.counts.shows}
					{t.counts.shows === 1 ? 'show' : 'shows'}
				</span>
			</div>
			<div class="divide-y">
				{#each t.shows as s (s.id)}
					{@const adv = advanceStyle(s)}
					<a
						href={`/shows/${s.id}`}
						class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
					>
						<span class="flex min-w-0 items-center gap-3">
							<span class="w-[58px] flex-none font-mono text-[11px] text-signal"
								>{shortDate(s.starts_at)}</span
							>
							<span class="min-w-0 truncate text-sm font-medium">{s.title}</span>
						</span>
						<span class="flex shrink-0 items-center gap-3 font-mono text-[11px]">
							{#if s.location}
								<span class="text-muted-foreground">{s.location}</span>
							{/if}
							<span
								class="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.06em]"
								style="color:{adv[0]};background:{adv[1]};">{s.advance ?? 'Pending'}</span
							>
						</span>
					</a>
				{/each}
			</div>
			{#if t.unadvanced}
				<div
					class="border-t px-5 py-2.5 text-right font-mono text-[11px] text-muted-foreground"
				>
					{t.unadvanced}
					{t.unadvanced === 1 ? 'show needs' : 'shows need'} advancing
				</div>
			{/if}
		</div>
	{/each}

	<!-- Everything else in flight: next phase and what hangs off it. -->
	{#if plain.length}
		<div class="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
			{#each plain as t (t.id)}
				{@const late = t.due ? relDay(t.due) : null}
				<a
					href={`/projects?open=${t.id}`}
					class="flex flex-col gap-2 rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40 hover:bg-accent"
				>
					<span class="flex items-baseline justify-between gap-2">
						<span class={cardLabel}>{kindLabel(t.kind)}</span>
						{#if late?.label}
							<span
								class="font-mono text-[10px] {late.overdue
									? 'text-destructive'
									: 'text-muted-foreground'}">{late.label}</span
							>
						{/if}
					</span>
					<span class="truncate text-[15px] font-semibold">{t.name}</span>
					<span class="font-mono text-[11px] text-signal">
						{t.next_action ? `next · ${t.next_action}` : 'no phase set'}
					</span>
					<span class="font-mono text-[10.5px] text-muted-foreground">{rollup(t)}</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if d && !d.threads.length}
		<p class="mb-4 rounded-[12px] border bg-card px-5 py-4 font-mono text-xs text-muted-foreground">
			Nothing in flight — <a href="/projects?new=1" class="text-signal hover:opacity-80">start a project</a>
			and it shows up here.
		</p>
	{/if}

	<!-- Recent notes and whatever's come loose from a thread. -->
	<div class="grid gap-4 lg:grid-cols-2">
		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Recent notes</span>
				<a
					href="/notes"
					class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
					>all notes</a
				>
			</div>
			<div class="divide-y">
				{#if d?.recent_notes.length}
					{#each d.recent_notes as n (n.id)}{@render noteRow(n)}{/each}
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">No notes yet.</p>
				{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Loose ends</span>
				<a
					href="/todos"
					class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
				>
					{d?.loose.open_total ?? 0} open · {d?.loose.undated ?? 0} undated
				</a>
			</div>
			<div class="divide-y">
				{#if d?.loose.overdue.length}
					{#each d.loose.overdue as t (t.id)}{@render todoRow(t)}{/each}
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">Nothing overdue.</p>
				{/if}
			</div>
		</section>
	</div>
</div>
