<script lang="ts">
	// The Overview as operator console (Dashboard Redesign): headline + KPI row
	// up top, then a grid of panels — capture, suggestions, the week, projects,
	// notes, tour, money pulse, loose ends — each draggable by its header, the
	// order kept in localStorage. The flows the old page shipped all survive:
	// the Now slot and session clock, the start-of-day ritual, the weekly-note
	// checklist with in-place toggles. They just live inside the new furniture.
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { FocusItem, NoteBrief, Thread, ThreadShow, TodoBrief, WeekTask } from '$lib/types';
	import { getModule } from '$lib/modules';
	import { relTime } from '$lib/format';
	import { statusColor, STATE } from '$lib/status';
	import { kindInfo } from '$lib/projects/kinds';
	import { ADVANCE_STYLE } from '$lib/projects/shows';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import Check from '@lucide/svelte/icons/check';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Pin from '@lucide/svelte/icons/pin';
	import Play from '@lucide/svelte/icons/play';
	import Square from '@lucide/svelte/icons/square';
	import Sunrise from '@lucide/svelte/icons/sunrise';

	const todosMod = getModule('todos')!;
	const projectsMod = getModule('projects')!;

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

	// Week tasks checked today (tallied by the toggle action) plus todos
	// closed today (counted by /dashboard).
	const doneToday = $derived((d?.done_today ?? 0) + data.tallyToday);

	// One 30s tick drives both the session chip and the header clock.
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
	const clock = $derived(
		new Date(nowTick).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

	const dated = $derived((d?.threads ?? []).filter((t) => t.shows.length));

	// The single most pressing thread: slipped beats upcoming beats in-flight.
	const headline = $derived.by(() => {
		if (!d) return null;
		const withDue = d.threads
			.map((t) => ({ t, day: days(t.due_effective ?? t.due) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null);
		const late = withDue.filter((x) => x.day < 0).sort((a, b) => a.day - b.day)[0];
		if (late)
			return {
				t: late.t,
				tail: `was due ${relDay(late.t.due_effective ?? late.t.due).label}`,
				late: true
			};
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

	function kindLabel(kind: string | null): string {
		const info = kindInfo(kind ?? undefined);
		return info.key === 'project' && kind ? kind : info.label;
	}
	function rollup(t: Thread): string {
		const bits = [
			t.counts.tasks ? `${t.counts.tasks} open task${t.counts.tasks === 1 ? '' : 's'}` : '',
			t.counts.notes ? `${t.counts.notes} note${t.counts.notes === 1 ? '' : 's'}` : '',
			t.counts.shows ? `${t.counts.shows} show${t.counts.shows === 1 ? '' : 's'}` : ''
		].filter(Boolean);
		return bits.length ? bits.join(' · ') : 'nothing attached yet';
	}
	const advanceStyle = (s: ThreadShow) =>
		ADVANCE_STYLE[s.advance ?? 'Pending'] ?? ADVANCE_STYLE.Pending;
	const shortDate = (iso: string | null) => {
		if (!iso) return 'TBD';
		const dt = new Date(iso.length <= 10 ? `${iso}T00:00` : iso);
		return isNaN(dt.getTime())
			? 'TBD'
			: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};

	// --- start-of-day ritual (unchanged mechanics, new placement) ---
	let planning = $state(false);
	let picked = $state<string[]>([]);
	const focusKey = (i: FocusItem) =>
		i.kind === 'task' ? `task:${i.line}:${i.text}` : `thread:${i.id}`;
	const candidates = $derived.by(() => {
		const out: { key: string; canon: string; label: string; sub: string }[] = [];
		for (const t of data.weekNote?.tasks.filter((t) => !t.done) ?? [])
			out.push({
				key: JSON.stringify({ kind: 'task', text: t.text, line: t.line }),
				canon: `task:${t.line}:${t.text}`,
				label: t.text,
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

	// --- panel order: drag a header, swap slots, remember it ---
	const PANELS = ['capture', 'assist', 'week', 'projects', 'notes', 'tour', 'money', 'loose'];
	const DEFAULT_ORDER = Object.fromEntries(PANELS.map((k, i) => [k, i]));
	let order = $state<Record<string, number>>({ ...DEFAULT_ORDER });
	$effect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem('base-overview-order') ?? '');
			if (saved && typeof saved === 'object') {
				const clean: Record<string, number> = { ...DEFAULT_ORDER };
				for (const [k, v] of Object.entries(saved))
					if (PANELS.includes(k) && typeof v === 'number' && Number.isInteger(v)) clean[k] = v;
				order = clean;
			}
		} catch {
			// no saved order yet
		}
	});
	let dragKey: string | null = null;
	const dragStart = (e: DragEvent) => {
		dragKey = (e.currentTarget as HTMLElement).dataset.key ?? null;
	};
	const dragOver = (e: DragEvent) => e.preventDefault();
	const dragDrop = (e: DragEvent) => {
		const to = (e.currentTarget as HTMLElement).dataset.key;
		if (!dragKey || !to || dragKey === to) return;
		const next = { ...order };
		[next[dragKey], next[to]] = [next[to], next[dragKey]];
		order = next;
		try {
			localStorage.setItem('base-overview-order', JSON.stringify(next));
		} catch {
			// storage full/blocked — the session still gets the new order
		}
	};

	// --- quick capture routing (regex is the honest "local model" for now) ---
	const CAPT = [
		{ k: 'todo', label: 'TODO', c: '#b3593a' },
		{ k: 'note', label: 'NOTE', c: '#3a6ea5' },
		{ k: 'txn', label: 'TXN', c: '#c68a1a' },
		{ k: 'event', label: 'EVENT', c: '#2f7d5b' },
		{ k: 'proj', label: 'PROJ', c: '#7d5ba6' }
	];
	let capText = $state('');
	let capType = $state<string | null>(null);
	const capGuess = $derived(
		/\$|paid|bill|bought|spent/i.test(capText)
			? 'txn'
			: /show|venue|tour|gig/i.test(capText)
				? 'event'
				: /note|idea|thought|remember/i.test(capText)
					? 'note'
					: /project|build|design|wire/i.test(capText)
						? 'proj'
						: 'todo'
	);
	const capSelected = $derived(capType ?? capGuess);
	const capLine = $derived(
		capType
			? `manual route · ${capType.toUpperCase()}`
			: capText
				? `local guess · ${capGuess.toUpperCase()}`
				: 'routes as you type — regex now, local model later'
	);
	// This session's captures, shown under the input so the panel answers
	// "did that land?" without a page change.
	let captured = $state<{ text: string; type: string; href: string }[]>([]);

	// --- suggestions (top of the assist queue, decided in place) ---
	const SUGG_KIND: Record<string, { label: string; color: string }> = {
		todo_triage: { label: 'TODO TRIAGE', color: '#b3593a' },
		project: { label: 'PROJECT', color: '#7d5ba6' },
		recurring: { label: 'RECURRING', color: '#c68a1a' },
		enrich: { label: 'ENRICH', color: '#3a6ea5' }
	};
	let whyOpen = $state<number[]>([]);
	const toggleWhy = (id: number) =>
		(whyOpen = whyOpen.includes(id) ? whyOpen.filter((x) => x !== id) : [...whyOpen, id]);

	// --- KPI row ---
	const overdueThreads = $derived(
		(d?.threads ?? [])
			.map((t) => ({ t, day: days(t.due_effective ?? t.due) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null && x.day < 0)
			.sort((a, b) => a.day - b.day)
	);
	const overdueCount = $derived(overdueThreads.length + (d?.loose.overdue.length ?? 0));
	const overdueLead = $derived.by(() => {
		const t = overdueThreads[0];
		if (t) return `${t.t.name.toLowerCase()} · ${-t.day}d`;
		const todo = d?.loose.overdue[0];
		if (todo?.due) return `${todo.title.toLowerCase()} · ${-(days(todo.due) ?? 0)}d`;
		return '';
	});
	const tourNext = $derived(
		dated
			.map((t) => ({ t, day: days(t.opens_at) }))
			.filter((x): x is { t: Thread; day: number } => x.day != null && x.day >= 0)
			.sort((a, b) => a.day - b.day)[0] ?? null
	);
	// The net spark: this half-year's monthly nets, scaled into an 84×26 box.
	const netSpark = $derived.by(() => {
		const nets = (data.money?.months ?? []).map((m) => m.income - m.expense);
		if (nets.length < 2) return '';
		const lo = Math.min(...nets, 0);
		const hi = Math.max(...nets, 1);
		return nets
			.map((n, i) => {
				const x = (84 * i) / (nets.length - 1);
				const y = 23 - (20 * (n - lo)) / (hi - lo || 1);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});
	const pulseMax = $derived(
		Math.max(...(data.money?.months ?? []).flatMap((m) => [m.income, m.expense]), 1)
	);

	const usd = (n: number) =>
		n.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
			maximumFractionDigits: 2
		});

	const STRIP_C: Record<string, string> = {
		events: '#2f7d5b',
		todos: '#b3593a',
		projects: '#7d5ba6',
		notes: '#3a6ea5'
	};

	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
	const panelCard = 'overflow-hidden rounded-[12px] border bg-card';
	const drill = 'font-mono text-[10px] text-signal transition-opacity hover:opacity-80';
	const quickBtn =
		'inline-flex cursor-pointer items-center gap-2 rounded-[10px] border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground/85 transition-colors hover:border-signal/45';
	const verb =
		'cursor-pointer rounded-[5px] border px-2 py-px font-mono text-[10px] transition-colors';
</script>

<svelte:head><title>base — overview</title></svelte:head>

{#snippet weekTask(noteId: number, t: WeekTask, ctx: 'week' | 'today' = 'week')}
	<div
		class="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
		style={ctx === 'week' && t.depth ? `padding-left:${1 + t.depth * 1.5}rem` : ''}
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
			class="min-w-0 flex-1 truncate text-[13px] {t.done ? 'text-muted-foreground line-through' : ''}"
			>{t.text}{#if ctx === 'today' && t.parent}<span class="text-muted-foreground">
					· {t.parent}</span
				>{/if}</a
		>
	</div>
{/snippet}

{#snippet noteRow(n: NoteBrief, pinned = false)}
	<a
		href={`/notes/${n.id}`}
		class="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-accent"
	>
		<span class="w-3 flex-none text-center">
			{#if pinned}<Pin class="size-3 fill-current text-signal" />{/if}
		</span>
		<span class="min-w-0 flex-1 truncate text-[13.5px]">{n.title}</span>
		{#if n.kind && n.kind !== 'note'}
			<span class="flex-none font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/80"
				>{n.kind}</span
			>
		{/if}
		<span class="w-12 flex-none text-right font-mono text-[10px] text-muted-foreground"
			>{relTime(n.updated_at)}</span
		>
	</a>
{/snippet}

{#snippet looseRow(t: TodoBrief)}
	<a
		href={`/todos/${t.id}`}
		class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
	>
		<span class="size-2 flex-none rounded-full" style={`background:${STATE.idle};`}></span>
		<span class="min-w-0 flex-1 truncate text-sm">{t.title}</span>
		{#if t.due}
			{@const r = relDay(t.due)}
			<span
				class="flex-none font-mono text-[10.5px] {r.overdue
					? 'text-destructive'
					: 'text-muted-foreground'}">{r.label}</span
			>
		{/if}
		{#if t.status}
			<StatusDot mod={todosMod} value={t.status} showLabel />
		{/if}
	</a>
{/snippet}

<div class="max-w-[1460px] px-9 pb-14 pt-7">
	<!-- Eyebrow: the date, the score, the clock. -->
	<div class="flex items-baseline justify-between gap-4">
		<div class="font-mono text-[10.5px] tracking-[0.14em] text-muted-foreground">
			{todayLabel.toUpperCase()} — OPERATOR CONSOLE
			{#if doneToday}
				<span class="text-signal">· {doneToday} DONE TODAY</span>
			{/if}
		</div>
		<div class="font-mono text-[10.5px] tabular-nums text-muted-foreground">{clock}</div>
	</div>

	<!-- The headline: the one most pressing thing, made pressable. -->
	<h1 class="mb-0 mt-2.5 text-[32px] font-bold leading-[1.15] tracking-[-0.02em]">
		{#if !d}
			System offline.
		{:else if headline}
			{headline.t.name}
			<span class={headline.late ? 'text-destructive' : 'text-signal'}>{headline.tail}.</span>
		{:else if d.threads.length}
			{d.threads.length}
			{d.threads.length === 1 ? 'thread' : 'threads'} in flight.
		{:else}
			Nothing in flight.
		{/if}
	</h1>

	<div class="mt-4 flex flex-wrap items-center gap-2.5">
		{#if data.session}
			<span
				class="inline-flex items-center gap-2.5 rounded-[10px] border border-signal/60 bg-signal/10 px-4 py-2 text-[13.5px] font-bold"
			>
				<span class="size-2 flex-none animate-pulse rounded-full bg-signal"></span>
				<span class="max-w-[280px] truncate">{data.session.label}</span>
				<span class="font-mono text-[12.5px] font-semibold text-signal">{fmtDur(sessionMins)}</span>
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
		{:else if headline}
			<form method="POST" action="?/startSession" use:enhance>
				<input type="hidden" name="label" value={headline.t.name} />
				<input type="hidden" name="href" value={`/projects?open=${headline.t.id}`} />
				<button
					type="submit"
					class="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-signal px-4 py-2 text-[14px] font-bold text-signal-foreground transition-opacity hover:opacity-90"
					title={`Start the clock and open ${headline.t.name} in the tracker`}
				>
					<Play class="size-4 fill-current" />
					Start{headline.t.next_action ? ` — ${headline.t.next_action}` : ''}
				</button>
			</form>
			<span class="font-mono text-[11px] text-muted-foreground">
				{kindLabel(headline.t.kind)} · {rollup(headline.t)}
			</span>
		{/if}
		<div class="ml-auto flex items-center gap-2">
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
					<Sunrise class="size-3.5 text-signal" /> Start day
				</button>
			{/if}
			<form method="POST" action="?/weekly" use:enhance>
				<button
					type="submit"
					class={quickBtn}
					title={`Open (or start) this week's running note — week of ${data.weekOf}`}
				>
					<NotebookPen class="size-3.5 text-signal" /> Weekly note
				</button>
			</form>
			<a href="/projects?new=1" class={quickBtn} title="Start a new project">
				<FolderPlus class="size-3.5" style="color:#2f7d5b;" /> New project
			</a>
		</div>
	</div>

	{#if data.apiError}
		<div
			class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	<!-- Today's plan (or the picker) — the ritual, right under the actions. -->
	{#if data.focus}
		<div class="mt-4 overflow-hidden rounded-[12px] border border-signal/60 bg-card">
			<div class="flex items-center justify-between border-b px-4 py-2.5">
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
							class="flex items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-accent"
						>
							<span class="min-w-0 truncate text-sm font-medium">{row.thread.name}</span>
							<span class="shrink-0 font-mono text-[11px] text-signal">
								{row.thread.next_action
									? `next · ${row.thread.next_action}`
									: kindLabel(row.thread.kind)}
							</span>
						</a>
					{:else}
						<p class="px-4 py-2 text-sm text-muted-foreground line-through">
							{row.it.kind === 'task' ? row.it.text : row.it.name}
						</p>
					{/if}
				{/each}
			</div>
		</div>
	{:else if planning}
		<form
			method="POST"
			action="?/startDay"
			use:enhance={() =>
				async ({ update }) => {
					planning = false;
					await update();
				}}
			class="mt-4 overflow-hidden rounded-[12px] border border-signal/60 bg-card"
		>
			<div class="flex items-center justify-between border-b px-4 py-2.5">
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
						class="flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-accent {full
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
					<p class="px-4 py-3 font-mono text-xs text-muted-foreground">
						Nothing to pick from — add week tasks or start a project.
					</p>
				{/each}
			</div>
			<div class="border-t px-4 py-2.5">
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

	<!-- KPI row -->
	<div class="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
		<a href="/todos" class="rounded-[10px] border bg-card px-4 py-3 transition-colors hover:border-ring/40">
			<div class={cardLabel}>Open todos</div>
			<div class="mt-1 flex items-end justify-between gap-2">
				<span class="text-[26px] font-bold leading-none tabular-nums">{d?.loose.open_total ?? 0}</span>
				<span class="font-mono text-[10px] text-muted-foreground">{d?.loose.undated ?? 0} undated</span>
			</div>
		</a>
		<a
			href="/todos"
			class="rounded-[10px] border bg-card px-4 py-3 transition-colors hover:border-ring/40 {overdueCount
				? 'border-destructive/40'
				: ''}"
		>
			<div class="{cardLabel} {overdueCount ? 'text-destructive' : ''}">Overdue</div>
			<div class="mt-1 flex items-end justify-between gap-2">
				<span
					class="text-[26px] font-bold leading-none tabular-nums {overdueCount
						? 'text-destructive'
						: ''}">{overdueCount}</span
				>
				{#if overdueLead}
					<span class="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
						>{overdueLead}</span
					>
				{/if}
			</div>
		</a>
		<a href="/money" class="rounded-[10px] border bg-card px-4 py-3 transition-colors hover:border-ring/40">
			<div class={cardLabel}>Net · {data.money?.monthLabel ?? '—'}{data.money?.stale ? ' *' : ''}</div>
			<div class="mt-1 flex items-end justify-between gap-2">
				<span
					class="text-[26px] font-bold leading-none tabular-nums"
					style={`color:${(data.money?.net ?? 0) >= 0 ? '#2f7d5b' : '#b23a26'};`}
				>
					{data.money ? `${data.money.net >= 0 ? '+' : ''}${usd(data.money.net)}` : '—'}
				</span>
				{#if netSpark}
					<svg width="84" height="26" viewBox="0 0 84 26" class="flex-none">
						<polyline
							points={netSpark}
							fill="none"
							stroke={(data.money?.net ?? 0) >= 0 ? '#2f7d5b' : '#b23a26'}
							stroke-width="1.5"
						/>
					</svg>
				{/if}
			</div>
		</a>
		<a
			href={tourNext ? `/projects?open=${tourNext.t.id}` : '/calendar'}
			class="rounded-[10px] border bg-card px-4 py-3 transition-colors hover:border-ring/40"
		>
			<div class={cardLabel}>{tourNext ? `${tourNext.t.name.split('—')[0].trim()} opens` : 'Next dates'}</div>
			<div class="mt-1 flex items-end justify-between gap-2">
				<span class="text-[26px] font-bold leading-none tabular-nums"
					>{tourNext ? `${tourNext.day}d` : '—'}</span
				>
				{#if tourNext}
					<span class="font-mono text-[10px] text-muted-foreground">
						{tourNext.t.counts.shows} shows · {tourNext.t.unadvanced} pending
					</span>
				{/if}
			</div>
		</a>
	</div>

	<!-- The panel grid. Order is yours — drag a header. -->
	<div class="mt-3.5 grid grid-cols-12 gap-3.5">
		<!-- QUICK CAPTURE -->
		<section class="{panelCard} col-span-12" style={`order:${order.capture};`}>
			<header
				draggable="true"
				data-key="capture"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Quick capture</span>
				</span>
				<span class="font-mono text-[10px] text-muted-foreground">{capLine}</span>
			</header>
			<div class="px-4 py-3">
				<form
					method="POST"
					action="?/capture"
					use:enhance={({ formData }) =>
						async ({ result, update }) => {
							if (result.type === 'success' && result.data?.captured) {
								captured = [
									{
										text: String(formData.get('title') ?? ''),
										type: String(result.data.type ?? 'todo'),
										href: String(result.data.href ?? '')
									},
									...captured
								];
								capText = '';
								capType = null;
							}
							await update({ reset: false });
						}}
					class="flex flex-wrap items-center gap-2.5"
				>
					<input
						name="title"
						bind:value={capText}
						placeholder="get it out of your head…"
						autocomplete="off"
						class="min-w-[220px] flex-1 rounded-[8px] border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-signal"
					/>
					<input type="hidden" name="type" value={capSelected} />
					<span class="font-mono text-[9px] tracking-[0.12em] text-muted-foreground/70">ROUTE</span>
					<span class="flex gap-1.5">
						{#each CAPT as ct (ct.k)}
							{@const sel = ct.k === capSelected}
							<button
								type="button"
								onclick={() => (capType = capType === ct.k ? null : ct.k)}
								class="cursor-pointer rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-[0.1em] transition-colors"
								style={sel
									? `border-color:${ct.c}88;color:${ct.c};background:${ct.c}1a;`
									: 'color:var(--muted-foreground);'}>{ct.label}</button
							>
						{/each}
					</span>
					<button
						type="submit"
						class="cursor-pointer rounded-[8px] bg-signal px-4 py-2 text-[13px] font-semibold text-signal-foreground transition-opacity hover:opacity-90"
						>Add</button
					>
				</form>
				{#if captured.length}
					<div class="mt-2.5 flex flex-col gap-1.5 border-t pt-2">
						{#each captured.slice(0, 4) as c, i (i)}
							{@const meta = CAPT.find((x) => x.k === c.type) ?? CAPT[0]}
							<a href={c.href} class="flex items-center gap-2.5 text-[12.5px] hover:text-signal">
								<span class="size-[5px] flex-none rounded-full" style={`background:${meta.c};`}></span>
								<span class="font-mono text-[9px] tracking-[0.1em] text-muted-foreground"
									>{meta.label}</span
								>
								<span class="min-w-0 truncate">{c.text}</span>
								<span class="font-mono text-[9px] text-muted-foreground/70">added — open →</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- SUGGESTIONS -->
		<section class="{panelCard} col-span-12" style={`order:${order.assist};`}>
			<header
				draggable="true"
				data-key="assist"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Suggestions</span>
				</span>
				<a href="/assist" class={drill}>{data.assistPending} pending · review all →</a>
			</header>
			<div>
				{#each data.assistTop as s (s.id)}
					{@const k = SUGG_KIND[s.kind] ?? { label: s.kind.toUpperCase(), color: STATE.idle }}
					<div class="border-b last:border-b-0">
						<div class="flex items-center gap-2.5 px-4 py-2">
							<span class="size-1.5 flex-none rounded-full" style={`background:${k.color};`}></span>
							<span class="w-[86px] flex-none font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground"
								>{k.label}</span
							>
							<span class="min-w-0 flex-1 truncate text-[13.5px]">{s.title}</span>
							<button
								type="button"
								onclick={() => toggleWhy(s.id)}
								class="cursor-pointer px-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-signal"
								>{whyOpen.includes(s.id) ? '▾' : '▸'} why</button
							>
							<form method="POST" action="?/assistAccept" use:enhance class="flex">
								<input type="hidden" name="id" value={s.id} />
								<button
									class={verb}
									style="border-color:#2f7d5b66;color:#2f7d5b;"
									title={`Accept — writes to ${s.writes}`}>✓</button
								>
							</form>
							<form method="POST" action="?/assistDismiss" use:enhance class="flex">
								<input type="hidden" name="id" value={s.id} />
								<button class="{verb} border-input text-muted-foreground" title="Dismiss">✕</button>
							</form>
						</div>
						{#if whyOpen.includes(s.id)}
							<div
								class="flex items-center gap-3.5 px-4 pb-2 pl-[136px] font-mono text-[9.5px] text-muted-foreground"
							>
								<span>{s.why}</span>
								<span class="text-muted-foreground/70">→ writes to {s.writes}</span>
							</div>
						{/if}
					</div>
				{:else}
					<div class="px-4 py-3 font-mono text-[10px] text-muted-foreground">
						queue clear — next rules pass at the top of the hour
					</div>
				{/each}
			</div>
		</section>

		<!-- THIS WEEK -->
		<section class="{panelCard} col-span-12" style={`order:${order.week};`}>
			<header
				draggable="true"
				data-key="week"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>This week</span>
				</span>
				{#if data.weekNote}
					{@const finished = data.weekNote.tasks.filter((t) => t.done)}
					<a href={`/notes/${data.weekNote.id}`} class={drill}>
						{finished.length}/{data.weekNote.tasks.length} done · open note →
					</a>
				{:else}
					<form method="POST" action="?/weekly" use:enhance>
						<button class="cursor-pointer {drill}">start the weekly →</button>
					</form>
				{/if}
			</header>
			<div class="grid grid-cols-7">
				{#each data.week as day (day.iso)}
					<div
						class="min-h-[84px] border-r px-2.5 py-2 last:border-r-0 {day.today ? 'bg-signal/5' : ''}"
					>
						<div class="flex items-baseline gap-1.5">
							<span class="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70"
								>{day.dow}</span
							>
							<span
								class="font-mono text-[12px] font-semibold {day.today ? 'text-signal' : ''}"
								>{day.num}</span
							>
						</div>
						<div class="mt-1.5 flex flex-col gap-1">
							{#each day.items.slice(0, 4) as it, i (i)}
								<a
									href={it.href}
									class="flex items-center gap-1.5 text-[11px] leading-tight hover:text-signal"
								>
									<span
										class="size-[5px] flex-none rounded-full"
										style={`background:${STRIP_C[it.c]};`}
									></span>
									<span class="truncate">{it.t}</span>
								</a>
							{/each}
							{#if day.items.length > 4}
								<span class="font-mono text-[9px] text-muted-foreground/70"
									>+{day.items.length - 4} more</span
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			{#if data.weekNote?.tasks.length}
				<div class="divide-y border-t">
					{#each data.weekNote.tasks as t (t.line)}
						{@render weekTask(data.weekNote.id, t)}
					{/each}
				</div>
			{/if}
		</section>

		<!-- ACTIVE PROJECTS -->
		<section class="{panelCard} col-span-12 lg:col-span-7" style={`order:${order.projects};`}>
			<header
				draggable="true"
				data-key="projects"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Active projects</span>
				</span>
				<a href="/projects" class={drill}>board →</a>
			</header>
			<div class="divide-y">
				{#each d?.threads ?? [] as t (t.id)}
					{@const dot = statusColor(projectsMod, t.status) ?? STATE.idle}
					{@const due = relDay(t.due_effective ?? t.due)}
					<a
						href={`/projects?open=${t.id}`}
						class="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
					>
						<span class="size-2 flex-none rounded-full" style={`background:${dot};`}></span>
						<span class="w-[74px] flex-none truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground"
							>{kindLabel(t.kind)}</span
						>
						<span class="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
						{#if t.progress != null}
							<span class="h-1 w-[110px] flex-none overflow-hidden rounded-full bg-border">
								<span
									class="block h-full"
									style={`width:${t.progress}%;background:${dot};`}
								></span>
							</span>
						{/if}
						<span
							class="w-[92px] flex-none text-right font-mono text-[10.5px] {due.overdue
								? 'text-destructive'
								: 'text-muted-foreground'}">{due.label || '—'}</span
						>
					</a>
				{:else}
					<p class="px-4 py-3 font-mono text-xs text-muted-foreground">
						Nothing in flight — <a href="/projects?new=1" class="text-signal">start a project</a>.
					</p>
				{/each}
			</div>
		</section>

		<!-- NOTES -->
		<section class="{panelCard} col-span-12 lg:col-span-5" style={`order:${order.notes};`}>
			<header
				draggable="true"
				data-key="notes"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Notes</span>
				</span>
				<a href="/notes" class={drill}>all notes →</a>
			</header>
			<div class="divide-y">
				{#if d?.recent_notes.length}
					{#each d.recent_notes as n, i (n.id)}{@render noteRow(n, i === 0 && n.kind === 'weekly')}{/each}
				{:else}
					<p class="px-4 py-3 font-mono text-xs text-muted-foreground">No notes yet.</p>
				{/if}
			</div>
		</section>

		<!-- TOUR / DATED THREADS -->
		{#if dated.length}
			<section class="{panelCard} col-span-12 lg:col-span-7" style={`order:${order.tour};`}>
				<header
					draggable="true"
					data-key="tour"
					ondragstart={dragStart}
					ondragover={dragOver}
					ondrop={dragDrop}
					role="presentation"
					class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
				>
					<span class="flex min-w-0 items-center gap-2">
						<GripVertical class="size-3 flex-none text-muted-foreground/40" />
						<a href={`/projects?open=${dated[0].id}`} class="flex min-w-0 items-center gap-2 hover:opacity-80">
							<span class="{cardLabel} truncate">{dated[0].name}</span>
							{#if dated[0].next_action}
								<span class="flex-none font-mono text-[10px] uppercase tracking-[0.06em] text-signal"
									>{dated[0].next_action}</span
								>
							{/if}
						</a>
					</span>
					<span class="flex-none font-mono text-[10px] text-muted-foreground">
						{#if days(dated[0].opens_at) != null}
							{@const opens = days(dated[0].opens_at) ?? 0}
							{opens < 0 ? 'under way' : opens === 0 ? 'opens today' : `opens in ${opens} days`} ·
						{/if}
						{dated[0].counts.shows}
						{dated[0].counts.shows === 1 ? 'show' : 'shows'}
					</span>
				</header>
				{#each dated as t (t.id)}
					{#if t.id !== dated[0].id}
						<div class="border-t px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
							{t.name}
						</div>
					{/if}
					<div class="divide-y">
						{#each t.shows as s (s.id)}
							{@const adv = advanceStyle(s)}
							<a
								href={`/shows/${s.id}`}
								class="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
							>
								<span class="w-12 flex-none font-mono text-[10.5px] text-signal"
									>{shortDate(s.starts_at)}</span
								>
								<span class="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
								{#if s.location}
									<span class="flex-none font-mono text-[10px] text-muted-foreground">{s.location}</span>
								{/if}
								<span
									class="w-[86px] flex-none rounded-full py-0.5 text-center font-mono text-[8.5px] uppercase tracking-[0.1em]"
									style={`color:${adv[0]};background:${adv[1]};`}>{s.advance ?? 'Pending'}</span
								>
							</a>
						{/each}
					</div>
					{#if t.unadvanced}
						<div class="border-t px-4 py-2 text-right font-mono text-[10px]" style="color:#c68a1a;">
							{t.unadvanced}
							{t.unadvanced === 1 ? 'show needs' : 'shows need'} advancing
						</div>
					{/if}
				{/each}
			</section>
		{/if}

		<!-- MONEY PULSE -->
		<section
			class="{panelCard} col-span-12 {dated.length ? 'lg:col-span-5' : ''}"
			style={`order:${order.money};`}
		>
			<header
				draggable="true"
				data-key="money"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Money pulse</span>
				</span>
				<a href="/money" class={drill}>money →</a>
			</header>
			<div class="px-4 py-3">
				<div class="flex min-h-[56px] items-end justify-between gap-3">
					<div>
						<div class="font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground">
							NET · {(data.money?.monthLabel ?? '').toUpperCase()}{data.money?.stale ? ' *' : ''}
						</div>
						<div
							class="text-[24px] font-bold tabular-nums"
							style={`color:${(data.money?.net ?? 0) >= 0 ? '#2f7d5b' : '#b23a26'};`}
						>
							{data.money ? `${data.money.net >= 0 ? '+' : ''}${usd(data.money.net)}` : '—'}
						</div>
					</div>
					<div class="flex h-11 items-end gap-[5px]">
						{#each data.money?.months ?? [] as m, i (m.label)}
							{@const last = i === (data.money?.months.length ?? 0) - 1}
							<div class="flex items-end gap-[3px]" class:ml-1.5={i > 0}>
								<div
									class="w-[13px] rounded-t-[2px]"
									style={`height:${Math.max(3, (38 * m.income) / pulseMax)}px;background:#2f7d5b${last ? '' : '66'};`}
								></div>
								<div
									class="w-[13px] rounded-t-[2px]"
									style={`height:${Math.max(3, (38 * m.expense) / pulseMax)}px;background:#b23a26${last ? '' : '66'};`}
								></div>
							</div>
						{/each}
					</div>
				</div>
				<div class="mt-3 flex items-center justify-between border-t pt-2.5">
					<span class="font-mono text-[10px] text-muted-foreground">RECURRING / MO</span>
					<span class="font-mono text-[11px] tabular-nums">
						{usd(data.money?.recurring ?? 0)}
						{#if data.money?.unpaid}
							· <span style="color:#c68a1a;">{data.money.unpaid} unpaid</span>
						{/if}
					</span>
				</div>
			</div>
		</section>

		<!-- LOOSE ENDS -->
		<section class="{panelCard} col-span-12" style={`order:${order.loose};`}>
			<header
				draggable="true"
				data-key="loose"
				ondragstart={dragStart}
				ondragover={dragOver}
				ondrop={dragDrop}
				role="presentation"
				class="flex cursor-grab items-center justify-between gap-3 border-b px-4 py-2.5 active:cursor-grabbing"
			>
				<span class="flex items-center gap-2">
					<GripVertical class="size-3 text-muted-foreground/40" />
					<span class={cardLabel}>Loose ends</span>
				</span>
				<a href="/todos" class={drill}>
					{d?.loose.open_total ?? 0} open · {d?.loose.undated ?? 0} undated →
				</a>
			</header>
			<div class="divide-y">
				{#if d?.loose.overdue.length}
					{#each d.loose.overdue.slice(0, 3) as t (t.id)}{@render looseRow(t)}{/each}
				{:else}
					<p class="px-4 py-3 font-mono text-xs text-muted-foreground">Nothing overdue.</p>
				{/if}
			</div>
		</section>
	</div>

	<div class="mt-2.5 text-right font-mono text-[9.5px] text-muted-foreground/60">
		⠿ drag a panel header to rearrange
	</div>
</div>
