<script lang="ts">
	import { enhance } from '$app/forms';
	import { cn } from '$lib/utils';
	import { fmt } from '$lib/format';
	import type { PageData } from './$types';
	import type { TodoBrief, EventBrief, NoteBrief } from '$lib/types';
	import { getModule } from '$lib/modules';
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
	const totalActionable = $derived(
		d ? d.overdue.length + d.due_soon.length + d.in_progress.length + d.waiting.length : 0
	);
	const todayLabel = $derived(
		today
			? new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	function relDay(iso: string | null): { label: string; overdue: boolean } {
		if (!iso || !today) return { label: '', overdue: false };
		const day = Math.round(
			(new Date(iso.slice(0, 10) + 'T00:00:00').getTime() -
				new Date(today + 'T00:00:00').getTime()) /
				86400000
		);
		if (day === 0) return { label: 'today', overdue: false };
		if (day === 1) return { label: 'tomorrow', overdue: false };
		if (day < 0) return { label: day === -1 ? 'yesterday' : `${-day}d ago`, overdue: true };
		return { label: `in ${day}d`, overdue: false };
	}

	const quickBtn =
		'inline-flex cursor-pointer items-center gap-2 rounded-[12px] border bg-card px-4 py-3 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent';

	const readout = $derived([
		{ label: 'Overdue', value: d?.overdue.length ?? 0, danger: (d?.overdue.length ?? 0) > 0 },
		{ label: 'Due soon', value: d?.due_soon.length ?? 0, danger: false },
		{ label: 'In progress', value: d?.in_progress.length ?? 0, danger: false },
		{ label: 'Waiting on', value: d?.waiting.length ?? 0, danger: false }
	]);
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

{#snippet eventRow(e: EventBrief)}
	<a
		href={`/events/${e.id}`}
		class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="min-w-0 truncate text-sm">{e.title}</span>
		<span class="shrink-0 font-mono text-[11px] text-muted-foreground">
			{fmt(e.starts_at)}{e.location ? ` · ${e.location}` : ''}
		</span>
	</a>
{/snippet}

{#snippet noteRow(n: NoteBrief)}
	<a
		href={`/notes/${n.id}`}
		class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="min-w-0 truncate text-sm">{n.title}</span>
		<span class="shrink-0 font-mono text-[11px] text-muted-foreground">{fmt(n.meeting_time)}</span>
	</a>
{/snippet}

{#snippet empty(text: string)}
	<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">{text}</p>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<div class="mb-6">
		<div class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
			{todayLabel.toUpperCase()} — OPERATOR CONSOLE
		</div>
		<h1 class="mb-1.5 mt-2 text-[31px] font-extrabold tracking-[-0.02em]">
			{#if !d}
				System offline.
			{:else if totalActionable}
				<span class="text-signal tabular-nums">{totalActionable}</span>
				{totalActionable === 1 ? 'thing needs' : 'things need'} your attention
			{:else}
				You're all caught up.
			{/if}
		</h1>
	</div>

	<!-- Quick start: one click from logged-in to working. -->
	<div class="mb-6 flex flex-wrap items-stretch gap-2.5">
		<form method="POST" action="?/weekly" use:enhance>
			<button type="submit" class={quickBtn} title="Open (or start) this week's note">
				<NotebookPen class="size-4 text-signal" /> Weekly note
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

	<!-- Upcoming shows — dates you're playing, straight off the Calendar. -->
	{#if data.shows.length}
		<div class="mb-6 overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Shows
				</span>
				<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{data.shows.length}</span>
			</div>
			<div class="divide-y">
				{#each data.shows as s (s.id)}
					<a
						href={s.projectId ? `/projects?open=${s.projectId}` : `/events/${s.id}`}
						class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
					>
						<span class="flex min-w-0 items-center gap-3">
							<span class="w-[86px] flex-none font-mono text-[11px] text-signal"
								>{fmt(s.when)}</span
							>
							<span class="min-w-0 truncate text-sm font-medium">{s.title}</span>
						</span>
						{#if s.location}
							<span class="shrink-0 font-mono text-[11px] text-muted-foreground">{s.location}</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Active projects, one click back into any of them. -->
	{#if d && d.active_projects.length}
		<div class="mb-6 flex flex-wrap items-center gap-2">
			<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				Active
			</span>
			{#each d.active_projects as p (p.id)}
				<a
					href={`/projects?open=${p.id}`}
					class="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent"
				>
					<span class="size-1.5 rounded-full" style="background:#2f7d5b;"></span>{p.name}
				</a>
			{/each}
		</div>
	{/if}

	<!-- Readout tiles, as cards rather than a full-bleed divided band. -->
	<div class="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		{#each readout as s (s.label)}
			<div class="flex flex-col gap-1 rounded-[12px] border bg-card px-5 py-4">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					{s.label.toUpperCase()}
				</span>
				<span class={cn('text-[26px] font-extrabold tabular-nums', s.danger && 'text-destructive')}>
					{s.value}
				</span>
			</div>
		{/each}
	</div>

	{#if data.apiError}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Overdue
				</span>
				{#if d && d.overdue.length}
					<span class="font-mono text-[11px] tabular-nums text-destructive">{d.overdue.length}</span>
				{/if}
			</div>
			<div class="divide-y">
				{#if d && d.overdue.length}
					{#each d.overdue as t (t.id)}{@render todoRow(t)}{/each}
				{:else}{@render empty('Nothing overdue.')}{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Due soon
				</span>
				{#if d && d.due_soon.length}
					<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{d.due_soon.length}</span>
				{/if}
			</div>
			<div class="divide-y">
				{#if d && d.due_soon.length}
					{#each d.due_soon as t (t.id)}{@render todoRow(t)}{/each}
				{:else}{@render empty('Nothing due in the next two weeks.')}{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					In progress
				</span>
				{#if d && d.in_progress.length}
					<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{d.in_progress.length}</span>
				{/if}
			</div>
			<div class="divide-y">
				{#if d && d.in_progress.length}
					{#each d.in_progress as t (t.id)}{@render todoRow(t)}{/each}
				{:else}{@render empty('Nothing in progress.')}{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Waiting on
				</span>
				{#if d && d.waiting.length}
					<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{d.waiting.length}</span>
				{/if}
			</div>
			<div class="divide-y">
				{#if d && d.waiting.length}
					{#each d.waiting as t (t.id)}{@render todoRow(t)}{/each}
				{:else}{@render empty('Not waiting on anything.')}{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Upcoming
				</span>
				{#if d && d.upcoming_events.length}
					<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{d.upcoming_events.length}</span>
				{/if}
			</div>
			<div class="divide-y">
				{#if d && d.upcoming_events.length}
					{#each d.upcoming_events as e (e.id)}{@render eventRow(e)}{/each}
				{:else}{@render empty('Nothing scheduled ahead.')}{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Recent meetings
				</span>
			</div>
			<div class="divide-y">
				{#if d && d.recent_meetings.length}
					{#each d.recent_meetings as n (n.id)}{@render noteRow(n)}{/each}
				{:else}{@render empty('No meetings yet.')}{/if}
			</div>
		</section>
	</div>
</div>
