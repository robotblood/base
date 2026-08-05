<script lang="ts">
	// Overview, organised by *thread*: the handful of projects actually in
	// flight, each showing its own state, rather than one big todo list sliced
	// four ways by status. Live-show threads get a wide block with their dates
	// and advance state; everything else is a compact card with its next phase.
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type {
		ActivityBrief,
		FocusItem,
		NoteBrief,
		Thread,
		ThreadShow,
		TodoBrief,
		WeekTask
	} from '$lib/types';
	import { getModule } from '$lib/modules';
	import { kindInfo } from '$lib/projects/kinds';
	import { ADVANCE_STYLE } from '$lib/projects/shows';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import History from '@lucide/svelte/icons/history';
	import ListMusic from '@lucide/svelte/icons/list-music';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import Pin from '@lucide/svelte/icons/pin';
	import Play from '@lucide/svelte/icons/play';
	import Plus from '@lucide/svelte/icons/plus';
	import Square from '@lucide/svelte/icons/square';
	import Sunrise from '@lucide/svelte/icons/sunrise';

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

	// Timestamp-level "how long ago" — relDay's whole-day buckets are too coarse
	// for a trail meant to say "you were just here". updated_at comes back
	// timezone-naive but is stamped in UTC; parsed as-is the browser would read
	// it as local time and everything would look hours younger than it is.
	function relTime(iso: string | null): string {
		if (!iso) return '';
		const utc = /[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
		const mins = Math.round((Date.now() - new Date(utc).getTime()) / 60000);
		if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		const day = Math.round(mins / (60 * 24));
		return day === 1 ? 'yesterday' : `${day}d ago`;
	}
	// Where a touched record opens: projects open in the tracker, performances
	// on the show page, everything else on its record page.
	const activityHref = (a: ActivityBrief) =>
		a.module === 'projects'
			? `/projects?open=${a.id}`
			: a.module === 'events'
				? a.kind === 'performance'
					? `/shows/${a.id}`
					: `/events/${a.id}`
				: `/notes/${a.id}`;

	// Week tasks checked today (tallied by the toggle action) plus todos
	// closed today (counted by /dashboard).
	const doneToday = $derived((d?.done_today ?? 0) + data.tallyToday);

	// Live clock for the running session — a 30s tick; the display is in
	// minutes, so finer precision buys nothing.
	let nowTick = $state(Date.now());
	$effect(() => {
		const iv = setInterval(() => (nowTick = Date.now()), 30_000);
		return () => clearInterval(iv);
	});
	const sessionMins = $derived(
		data.session
			? Math.max(0, Math.round((nowTick - Date.parse(data.session.started_at)) / 60000))
			: 0
	);
	const fmtDur = (mins: number) =>
		mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

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

	// The headline is the single most pressing thread, not a sum of buckets: a
	// thread that has slipped its due date beats a date coming up, which beats
	// a bare count of what's in flight. It carries the whole thread because it
	// is also the Now slot — the Start button and context line hang off it.
	const headline = $derived.by(() => {
		if (!d) return null;
		const withDue = d.threads
			.map((t) => ({ t, day: days(t.due_effective ?? t.due) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null);
		const late = withDue.filter((x) => x.day < 0).sort((a, b) => a.day - b.day)[0];
		if (late)
			return { t: late.t, tail: `was due ${relDay(late.t.due_effective ?? late.t.due).label}`, late: true };
		const next = dated
			.map((t) => ({ t, day: days(t.opens_at) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null)
			.sort((a, b) => a.day - b.day)[0];
		if (next)
			return {
				t: next.t,
				tail: next.day === 0 ? 'opens today' : `opens in ${next.day} days`,
				late: false
			};
		const soon = withDue.sort((a, b) => a.day - b.day)[0];
		if (soon)
			return {
				t: soon.t,
				tail: `due ${relDay(soon.t.due_effective ?? soon.t.due).label}`,
				late: false
			};
		return null;
	});

	// The Now thread already fills the top of the page, so its card leaves the
	// grid — one place to start it from, not two. Dated threads keep their wide
	// block either way: the show list is information the slot can't carry.
	const plain = $derived(
		(d?.threads ?? []).filter((t) => !t.shows.length && t.id !== headline?.t.id)
	);

	// --- start-of-day ritual ---
	let planning = $state(false); // the picker card is open
	let picked = $state<string[]>([]); // selected candidate keys, capped at 3
	let showAll = $state(false); // "everything else" unfolded while focused

	// Identity for a focus item that survives the JSONB round trip — Postgres
	// reorders object keys, so two JSON.stringify results for the "same" item
	// need not match. Comparison happens on this, never on the JSON payload.
	const focusKey = (i: FocusItem) => (i.kind === 'task' ? `task:${i.line}:${i.text}` : `thread:${i.id}`);

	// What the picker offers: the week's open tasks, then the live threads.
	// `key` is exactly the JSON the startDay action parses back out; `canon`
	// is the stable identity used to match against a stored plan.
	const candidates = $derived.by(() => {
		const out: { key: string; canon: string; label: string; sub: string }[] = [];
		for (const t of data.weekNote?.tasks.filter((t) => !t.done) ?? [])
			out.push({
				key: JSON.stringify({ kind: 'task', text: t.text, line: t.line }),
				canon: `task:${t.line}:${t.text}`,
				label: t.text,
				// A subtask names its parent — a bare "Graphics" in the picker
				// reads as anyone's graphics.
				sub: t.parent ? `↳ ${t.parent}` : 'week task'
			});
		for (const t of d?.threads ?? [])
			out.push({
				key: JSON.stringify({ kind: 'thread', id: t.id, name: t.name }),
				canon: `thread:${t.id}`,
				label: t.name,
				sub: t.next_action ? `next · ${t.next_action}` : kindLabel(t.kind)
			});
		return out;
	});

	// The plan's items resolved against what's live right now: a task pick
	// becomes the current checklist row (so it toggles), a thread pick the
	// current thread. A pick that no longer resolves renders inert, by name.
	const focusRows = $derived.by(() =>
		(data.focus?.items ?? []).map((it) => {
			if (it.kind === 'thread')
				return { it, thread: (d?.threads ?? []).find((x) => x.id === it.id) ?? null, task: null };
			const tasks = data.weekNote?.tasks ?? [];
			const task =
				tasks.find((x) => x.line === it.line && x.text === it.text) ??
				tasks.find((x) => x.text === it.text) ??
				null;
			return { it, thread: null, task };
		})
	);

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

{#snippet noteRow(n: NoteBrief, pinned = false)}
	<a
		href={`/notes/${n.id}`}
		class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="flex min-w-0 items-center gap-2">
			{#if pinned}
				<Pin class="size-3 flex-none fill-current text-signal" />
			{/if}
			<span class="min-w-0 truncate text-sm">{n.title}</span>
		</span>
		<span class="flex shrink-0 items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
			{#if n.kind && n.kind !== 'note'}<span class="uppercase tracking-[0.06em]">{n.kind}</span>{/if}
			<!-- relTime, not relDay: updated_at is a UTC timestamp, and the
			     day-bucket label read evening edits as "tomorrow". -->
			<span>{relTime(n.updated_at)}</span>
		</span>
	</a>
{/snippet}

<!-- One weekly-note checklist row: the checkbox toggles in place (?/toggle
     flips the "- [ ]" line in the note body), the text still opens the note.
     In the week card subtasks indent under their parent; on the Today card
     (ctx 'today') a subtask stands alone, so it names its parent instead. -->
{#snippet weekTask(noteId: number, t: WeekTask, ctx: 'week' | 'today' = 'week')}
	<div
		class="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
		style={ctx === 'week' && t.depth ? `padding-left:${1.25 + t.depth * 1.5}rem` : ''}
	>
		<form method="POST" action="?/toggle" use:enhance class="flex flex-none">
			<input type="hidden" name="id" value={noteId} />
			<input type="hidden" name="line" value={t.line} />
			<input type="hidden" name="text" value={t.text} />
			<button
				type="submit"
				class="flex size-3.5 cursor-pointer items-center justify-center rounded-[4px] border transition-colors {t.done
					? 'border-signal bg-signal text-signal-foreground'
					: 'border-input hover:border-signal'}"
				aria-label={t.done ? `Mark “${t.text}” not done` : `Mark “${t.text}” done`}
			>
				{#if t.done}<Check class="size-2.5" strokeWidth={3.5} />{/if}
			</button>
		</form>
		<a
			href={`/notes/${noteId}`}
			class="min-w-0 flex-1 truncate text-sm {t.done ? 'text-muted-foreground line-through' : ''}"
			>{t.text}{#if ctx === 'today' && t.parent}<span class="text-muted-foreground">
					· {t.parent}</span
				>{/if}</a
		>
	</div>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<div class="mb-6">
		<div class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
			{todayLabel.toUpperCase()} — OPERATOR CONSOLE
			<!-- The day's score: week tasks checked + todos closed since local
			     midnight. Absent at zero — a scoreboard, not a reproach. -->
			{#if doneToday}
				<span class="text-signal">· {doneToday} DONE TODAY</span>
			{/if}
		</div>
		<h1 class="mb-1.5 mt-2 text-[31px] font-extrabold tracking-[-0.02em]">
			{#if !d}
				System offline.
			{:else if headline}
				{headline.t.name}
				<span class={headline.late ? 'text-destructive' : 'text-signal'}>{headline.tail}</span>.
			{:else if d.threads.length}
				{d.threads.length}
				{d.threads.length === 1 ? 'thread' : 'threads'} in flight.
			{:else}
				Nothing in flight.
			{/if}
		</h1>
		<!-- The Now slot: the headline made pressable. One big way in, so the
		     first decision of the day is already made — the grid below is the
		     override, not the menu. While a session runs, the row is the clock:
		     one session at a time, and ending it writes the time to ## Log. -->
		{#if data.session}
			<div class="mt-3 flex flex-wrap items-center gap-3">
				<span
					class="inline-flex items-center gap-2.5 rounded-[12px] border border-signal/60 bg-signal/10 px-5 py-2.5 text-[14px] font-bold"
				>
					<span class="size-2 flex-none animate-pulse rounded-full bg-signal"></span>
					<span class="max-w-[280px] truncate">{data.session.label}</span>
					<span class="font-mono text-[13px] font-semibold text-signal">{fmtDur(sessionMins)}</span>
				</span>
				<form method="POST" action="?/endSession" use:enhance>
					<button class={quickBtn} title="Stop the clock and write the time to the weekly log">
						<Square class="size-3.5" /> End session
					</button>
				</form>
				<form method="POST" action="?/discardSession" use:enhance>
					<button
						class="cursor-pointer font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
						title="Drop the session without logging it">discard</button
					>
				</form>
			</div>
		{:else if headline}
			<div class="mt-3 flex flex-wrap items-center gap-3">
				<form method="POST" action="?/startSession" use:enhance>
					<input type="hidden" name="label" value={headline.t.name} />
					<input type="hidden" name="href" value={`/projects?open=${headline.t.id}`} />
					<button
						type="submit"
						class="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-signal px-5 py-2.5 text-[14px] font-bold text-signal-foreground transition-opacity hover:opacity-90"
						title={`Start the clock and open ${headline.t.name} in the tracker`}
					>
						<Play class="size-4 fill-current" />
						Start{headline.t.next_action ? ` — ${headline.t.next_action}` : ''}
					</button>
				</form>
				<span class="font-mono text-[11px] text-muted-foreground">
					{kindLabel(headline.t.kind)} · {rollup(headline.t)}
				</span>
			</div>
		{/if}
	</div>

	<!-- The trail back in: the last few records actually written to, so the day
	     starts from yesterday's context instead of a cold menu. -->
	{#if d?.recent_activity?.length}
		<div class="mb-6 flex flex-wrap items-center gap-2">
			<span
				class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
			>
				<History class="size-3.5" /> Pick back up
			</span>
			{#each d.recent_activity as a (`${a.module}:${a.id}`)}
				<a
					href={activityHref(a)}
					class="inline-flex max-w-[300px] items-center gap-2.5 rounded-full border bg-card px-3.5 py-1.5 text-[12.5px] font-medium transition-colors hover:border-ring/40 hover:bg-accent"
				>
					<span class="min-w-0 truncate">{a.title}</span>
					<span class="flex-none font-mono text-[10px] font-normal text-muted-foreground"
						>{relTime(a.updated_at)}</span
					>
				</a>
			{/each}
		</div>
	{/if}

	<!-- Quick start: one click from logged-in to working. -->
	<div class="mb-6 flex flex-wrap items-stretch gap-2.5">
		{#if d && !data.focus}
			<button
				type="button"
				class={quickBtn}
				onclick={() => {
					picked = [];
					planning = !planning;
				}}
				title="Stamp the log and pick up to three things for today"
			>
				<Sunrise class="size-4 text-signal" /> Start day
			</button>
		{/if}
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

	<!-- Two columns below the buttons (note 568): main focus left — due tasks
	     and the projects in flight — notes always in reach on the right third. -->
	<div class="grid items-start gap-4 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-4 lg:col-span-2">

	{#if data.focus}
		<!-- Today: the plan made this morning. "change plan" clears the setting
		     and reopens the picker with the surviving picks preselected. -->
		<div class="overflow-hidden rounded-[12px] border border-signal/60 bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Today</span>
				<form
					method="POST"
					action="?/resetDay"
					use:enhance={() => {
						const prev = data.focus?.items ?? [];
						return async ({ update }) => {
							await update();
							picked = prev
								.map((i) => candidates.find((c) => c.canon === focusKey(i))?.key)
								.filter((k): k is string => !!k);
							planning = true;
						};
					}}
				>
					<button
						class="cursor-pointer font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
						>change plan</button
					>
				</form>
			</div>
			<div class="divide-y">
				{#each focusRows as row, i (i)}
					{#if row.task && data.weekNote}
						{@render weekTask(data.weekNote.id, row.task, 'today')}
					{:else if row.thread}
						<a
							href={`/projects?open=${row.thread.id}`}
							class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
						>
							<span class="min-w-0 truncate text-sm font-medium">{row.thread.name}</span>
							<span class="shrink-0 font-mono text-[11px] text-signal">
								{row.thread.next_action
									? `next · ${row.thread.next_action}`
									: kindLabel(row.thread.kind)}
							</span>
						</a>
					{:else}
						<!-- The record behind this pick is gone (task removed, project closed). -->
						<p class="px-5 py-2.5 text-sm text-muted-foreground line-through">
							{row.it.kind === 'task' ? row.it.text : row.it.name}
						</p>
					{/if}
				{/each}
			</div>
		</div>
	{:else if planning}
		<!-- The picker: this morning's one decision, made in one place. -->
		<form
			method="POST"
			action="?/startDay"
			use:enhance={() =>
				async ({ update }) => {
					planning = false;
					await update();
				}}
			class="overflow-hidden rounded-[12px] border border-signal/60 bg-card"
		>
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Plan today — up to three</span>
				<button
					type="button"
					onclick={() => (planning = false)}
					class="cursor-pointer font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
					>cancel</button
				>
			</div>
			<div class="max-h-[320px] divide-y overflow-y-auto">
				{#each candidates as c (c.key)}
					{@const full = picked.length >= 3 && !picked.includes(c.key)}
					<label
						class="flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent {full
							? 'opacity-40'
							: ''}"
					>
						<input
							type="checkbox"
							name="item"
							value={c.key}
							bind:group={picked}
							disabled={full}
							class="size-3.5 flex-none accent-signal"
						/>
						<span class="min-w-0 flex-1 truncate text-sm">{c.label}</span>
						<span class="max-w-[200px] shrink-0 truncate font-mono text-[10px] text-muted-foreground"
							>{c.sub}</span
						>
					</label>
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						Nothing to pick from — add week tasks or start a project.
					</p>
				{/each}
			</div>
			<div class="border-t px-5 py-3">
				<button
					type="submit"
					disabled={!picked.length}
					class="cursor-pointer rounded-[8px] bg-signal px-4 py-2 text-[13px] font-bold text-signal-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
				>
					Begin the day{picked.length
						? ` — ${picked.length} ${picked.length === 1 ? 'item' : 'items'}`
						: ''}
				</button>
			</div>
		</form>
	{/if}

	<!-- While a plan is on, the board folds away — the page shows the plan,
	     not the menu. One press brings the full board back. -->
	{#if data.focus}
		<button
			type="button"
			onclick={() => (showAll = !showAll)}
			class="flex cursor-pointer items-center gap-2 rounded-[12px] border bg-card px-5 py-3 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent"
		>
			<ChevronRight class="size-3.5 transition-transform {showAll ? 'rotate-90' : ''}" />
			Everything else — {plain.length + dated.length}
			{plain.length + dated.length === 1 ? 'thread' : 'threads'}{data.weekNote
				? ` · ${data.weekNote.tasks.filter((t) => !t.done).length} week tasks`
				: ''}
		</button>
	{/if}

	{#if !data.focus || showAll}
	<!-- This week's running note — the "## Tasks" checklist from the weekly. -->
	{#if data.weekNote}
		{@const finished = data.weekNote.tasks.filter((t) => t.done)}
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>This week</span>
				<a
					href={`/notes/${data.weekNote.id}`}
					class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
				>
					{finished.length}/{data.weekNote.tasks.length} done · open note
				</a>
			</div>
			<div class="divide-y">
				<!-- Document order, done struck in place: pulling finished rows to
				     the bottom would tear subtasks away from their parents, and a
				     fully struck list is its own victory lap. -->
				{#each data.weekNote.tasks as t (t.line)}
					{@render weekTask(data.weekNote.id, t)}
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						No tasks yet — add checkboxes under "## Tasks" in the weekly note.
					</p>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Everything else in flight: next phase and what hangs off it. -->
	{#if plain.length}
		<div class="grid gap-2.5 sm:grid-cols-2">
			{#each plain as t (t.id)}
				{@const late = t.due_effective ? relDay(t.due_effective) : null}
				<a
					href={`/projects?open=${t.id}`}
					class="flex flex-col gap-2 rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40 hover:bg-accent"
				>
					<span class="flex items-baseline justify-between gap-2">
						<span class={cardLabel}>{kindLabel(t.kind)}</span>
						{#if late?.label}
							<!-- An inherited deadline is named, so a date that belongs to
							     the parent doesn't read as this project's own. -->
							<span
								class="font-mono text-[10px] {late.overdue
									? 'text-destructive'
									: 'text-muted-foreground'}"
								title={t.due_from ? `Inherited from ${t.due_from}` : 'This project’s own due date'}
								>{late.label}{t.due_from ? ` · ${t.due_from}` : ''}</span
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

	<!-- Dated threads (live shows): the run, with advance state per date. -->
	{#each dated as t (t.id)}
		{@const opens = days(t.opens_at)}
		<div class="overflow-hidden rounded-[12px] border bg-card">
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

	{#if d && !d.threads.length}
		<p class="rounded-[12px] border bg-card px-5 py-4 font-mono text-xs text-muted-foreground">
			Nothing in flight — <a href="/projects?new=1" class="text-signal hover:opacity-80">start a project</a>
			and it shows up here.
		</p>
	{/if}
	{/if}

	</div>

	<!-- Notes rail — recent notes first, loose todos beneath. -->
	<div class="flex min-w-0 flex-col gap-4">
		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Notes</span>
				<a
					href="/notes"
					class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
					>all notes</a
				>
			</div>
			<div class="divide-y">
				{#if d?.recent_notes.length}
					<!-- The server pins the current weekly note first (see /dashboard). -->
					{#each d.recent_notes as n, i (n.id)}{@render noteRow(n, i === 0 && n.kind === 'weekly')}{/each}
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
</div>
