<script lang="ts">
	// The Work category page — a mini dashboard over todos, notes, and
	// applications. State up top, short lists below, and every card's header
	// is the drill-down into the table it summarises.
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { getModule } from '$lib/modules';
	import { relTime } from '$lib/format';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Plus from '@lucide/svelte/icons/plus';

	let { data }: { data: PageData } = $props();

	const todosMod = getModule('todos')!;
	const appsMod = getModule('applications')!;

	// Day-bucket labels for bare dates, same vocabulary as the overview.
	function relDay(iso: string | null): { label: string; overdue: boolean } {
		if (!iso || !data.today) return { label: '', overdue: false };
		const day = Math.round(
			(new Date(iso + 'T00:00:00').getTime() - new Date(data.today + 'T00:00:00').getTime()) /
				86400000
		);
		if (day === 0) return { label: 'today', overdue: false };
		if (day === 1) return { label: 'tomorrow', overdue: false };
		if (day < 0) return { label: day === -1 ? 'yesterday' : `${-day}d ago`, overdue: true };
		return { label: `in ${day}d`, overdue: false };
	}

	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
	const drill =
		'flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-signal';

	const tiles = $derived([
		{ label: 'Open todos', value: data.counts.openTodos, href: '/todos', alert: false },
		{ label: 'Overdue', value: data.counts.overdue, href: '/todos', alert: data.counts.overdue > 0 },
		{ label: 'Due today', value: data.counts.dueToday, href: '/todos', alert: false },
		{ label: 'Applications live', value: data.counts.openApps, href: '/applications', alert: false }
	]);
</script>

<svelte:head><title>base — work</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="WORK"
		title="Work"
		subtitle={`todos · notes · applications — ${data.counts.openTodos} open, ${data.counts.overdue} overdue`}
	>
		{#snippet actions()}
			<form
				method="POST"
				action="?/capture"
				use:enhance
				class="flex min-w-[260px] items-center gap-2 rounded-[12px] border bg-card px-3 py-1 focus-within:border-ring"
			>
				<Plus class="size-4 flex-none text-muted-foreground" />
				<input
					name="title"
					placeholder="Quick capture…"
					autocomplete="off"
					class="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-muted-foreground"
				/>
				<button
					type="submit"
					class="cursor-pointer rounded-[8px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
					>Add</button
				>
			</form>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.error}
		</div>
	{/if}

	<!-- The read of the room: four numbers, each a doorway into its table. -->
	<div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each tiles as t (t.label)}
			<a
				href={t.href}
				class={`rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40 ${
					t.alert ? 'border-destructive/50' : ''
				}`}
			>
				<div class={cardLabel}>{t.label}</div>
				<div
					class={`mt-1.5 font-mono text-[26px] font-bold tabular-nums tracking-tight ${
						t.alert ? 'text-destructive' : ''
					}`}
				>
					{t.value}
				</div>
			</a>
		{/each}
	</div>

	<div class="grid items-start gap-4 lg:grid-cols-3">
		<div class="flex min-w-0 flex-col gap-4 lg:col-span-2">
			<!-- Dated todos in triage order: late first, then nearest. -->
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class={cardLabel}>Up next</span>
					<a href="/todos" class={drill}>all todos <ArrowRight class="size-3" /></a>
				</div>
				<div class="divide-y">
					{#each data.upNext as t (t.id)}
						{@const r = relDay(t.due)}
						<a
							href={`/todos/${t.id}`}
							class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
						>
							<span class="min-w-0 truncate text-sm">{t.title}</span>
							<span class="flex shrink-0 items-center gap-2 font-mono text-[11px]">
								{#if r.label}
									<span class={r.overdue ? 'text-destructive' : 'text-muted-foreground'}>{r.label}</span>
								{/if}
								{#if t.status}
									<StatusDot mod={todosMod} value={t.status} showLabel />
								{/if}
							</span>
						</a>
					{:else}
						<div class="px-5 py-4 text-sm text-muted-foreground">Nothing dated is open.</div>
					{/each}
				</div>
			</div>

			<!-- The application pipeline: every stage with anything in it, then
			     the follow-ups that have become deadlines. -->
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class={cardLabel}>Applications</span>
					<a href="/applications" class={drill}>all applications <ArrowRight class="size-3" /></a>
				</div>
				{#if data.pipeline.length}
					<div class="flex flex-wrap gap-x-5 gap-y-2 border-b px-5 py-3">
						{#each data.pipeline as p (p.status)}
							<span class="flex items-center gap-2 text-[12.5px]">
								<StatusDot mod={appsMod} value={p.status} />
								<span class="text-foreground/80">{p.status}</span>
								<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{p.count}</span>
							</span>
						{/each}
					</div>
				{/if}
				<div class="divide-y">
					{#each data.followUps as a (a.id)}
						{@const r = relDay(a.follow_up)}
						<a
							href={`/applications/${a.id}`}
							class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
						>
							<span class="min-w-0 truncate text-sm">
								{a.role}{#if a.company}<span class="text-muted-foreground"> · {a.company}</span>{/if}
							</span>
							<span class="flex shrink-0 items-center gap-2 font-mono text-[11px]">
								{#if r.label}
									<span class={r.overdue ? 'text-destructive' : 'text-muted-foreground'}
										>follow up {r.label}</span
									>
								{/if}
								{#if a.status}
									<StatusDot mod={appsMod} value={a.status} showLabel />
								{/if}
							</span>
						</a>
					{:else}
						<div class="px-5 py-4 text-sm text-muted-foreground">No follow-ups scheduled.</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Notes stay in reach on the right, same as the overview. -->
		<div class="overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Recent notes</span>
				<a href="/notes" class={drill}>all notes <ArrowRight class="size-3" /></a>
			</div>
			<div class="divide-y">
				{#each data.recentNotes as n (n.id)}
					<a
						href={`/notes/${n.id}`}
						class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
					>
						<span class="min-w-0 truncate text-sm">{n.title}</span>
						<span
							class="flex shrink-0 items-center gap-2.5 font-mono text-[11px] text-muted-foreground"
						>
							{#if n.kind && n.kind !== 'note'}<span class="uppercase tracking-[0.06em]">{n.kind}</span
								>{/if}
							<span>{relTime(n.touched)}</span>
						</span>
					</a>
				{:else}
					<div class="px-5 py-4 text-sm text-muted-foreground">No notes yet.</div>
				{/each}
			</div>
		</div>
	</div>
</div>
