<script lang="ts">
	// The Assist review queue — machine-proposed changes, decided here.
	// Accept is the only path from this screen into another table, and it runs
	// server-side through app/assist.py's apply handlers. Everything on this
	// page is honest about which lane proposed what: `source` renders on every
	// row, and the sources card says what actually runs where.
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import Play from '@lucide/svelte/icons/play';

	let { data }: { data: PageData } = $props();

	// Which row is being reworded. Editing is local until Save/Accept posts it.
	let editing = $state<number | null>(null);

	const KIND: Record<string, { label: string; color: string }> = {
		todo_triage: { label: 'TODO TRIAGE', color: '#b3593a' },
		project: { label: 'PROJECT', color: '#7d5ba6' },
		recurring: { label: 'RECURRING', color: '#c68a1a' },
		enrich: { label: 'ENRICH', color: '#3a6ea5' }
	};
	const kindOf = (k: string) => KIND[k] ?? { label: k.toUpperCase(), color: '#b0aa9c' };

	// "rule:todo_undated" reads as its lane; other sources name themselves.
	const laneOf = (source: string) => (source.startsWith('rule:') ? source.slice(5) : source);

	const pending = $derived(data.suggestions.filter((s) => s.status === 'pending'));
	const resolved = $derived(data.suggestions.filter((s) => s.status !== 'pending'));

	const timeShort = (iso: string) => {
		const d = new Date(iso);
		const today = new Date().toDateString() === d.toDateString();
		return today
			? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
			: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};

	const scannedLine = (scanned: Record<string, number>) =>
		Object.entries(scanned)
			.map(([k, v]) => `${v} ${k}`)
			.join(' · ');

	const statusLine = (s: (typeof data.suggestions)[number]) =>
		s.status === 'accepted'
			? `✓ written to ${s.writes}`
			: s.status === 'dismissed'
				? '✕ dismissed · preference noted'
				: s.status === 'snoozed'
					? `⏱ snoozed${s.snooze_until ? ` until ${timeShort(s.snooze_until + 'T00:00:00')}` : ''}`
					: s.status;

	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
	const verbBtn =
		'cursor-pointer rounded-[5px] border px-2.5 py-0.5 font-mono text-[10.5px] transition-colors';
	// Reset the edit state after any action round-trips.
	const done = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			editing = null;
			await update();
		};
	};
</script>

<svelte:head><title>base — assist</title></svelte:head>

<div class="max-w-[1240px] px-9 pb-14 pt-7">
	<PageHeader
		code="AI"
		title="Assist"
		subtitle="rules pass → review queue → your call · money stays on this machine"
	/>

	{#if data.error}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.error}
		</div>
	{/if}

	<div class="grid items-start gap-4 lg:grid-cols-[1fr_280px]">
		<section class="overflow-hidden rounded-[12px] border bg-card">
			<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
				<span class={cardLabel}>Review queue</span>
				<span class="font-mono text-[10px] text-muted-foreground/80">
					accept writes to its table · dismiss teaches the model
				</span>
			</header>

			{#each [...pending, ...resolved] as s (s.id)}
				<div class="border-b px-5 py-3 last:border-b-0" class:opacity-55={s.status !== 'pending'}>
					<div class="flex items-center gap-2.5">
						<span
							class="size-[7px] flex-none rounded-full"
							style={`background:${kindOf(s.kind).color};`}
						></span>
						<span class="font-mono text-[9px] tracking-[0.12em] text-muted-foreground"
							>{kindOf(s.kind).label}</span
						>
						<span class="font-mono text-[9px] text-muted-foreground/70">→ {s.writes}</span>
						<span class="flex-1"></span>
						{#if s.status === 'pending'}
							{#if editing !== s.id}
								<form method="POST" use:enhance={done} class="flex items-center gap-1.5">
									<input type="hidden" name="id" value={s.id} />
									<button
										formaction="?/accept"
										class={`${verbBtn}`}
										style="border-color:#2f7d5b88;color:#2f7d5b;background:#2f7d5b14;"
									>
										Accept
									</button>
									<button
										type="button"
										onclick={() => (editing = s.id)}
										class={`${verbBtn} border-input text-muted-foreground hover:border-signal/50`}
									>
										Edit
									</button>
									<button
										formaction="?/snooze"
										class={`${verbBtn} border-input text-muted-foreground hover:border-signal/50`}
									>
										Snooze
									</button>
									<button
										formaction="?/dismiss"
										class={`${verbBtn} border-input text-muted-foreground hover:border-destructive/60 hover:text-destructive`}
									>
										Dismiss
									</button>
								</form>
							{/if}
						{:else}
							<span
								class="font-mono text-[10px]"
								style={s.status === 'accepted' ? 'color:#2f7d5b;' : ''}
								class:text-muted-foreground={s.status !== 'accepted'}
							>
								{statusLine(s)}
							</span>
						{/if}
					</div>

					{#if editing === s.id}
						<form method="POST" use:enhance={done} class="mt-2 flex items-center gap-1.5">
							<input type="hidden" name="id" value={s.id} />
							<!-- svelte-ignore a11y_autofocus -->
							<input
								name="title"
								value={s.edited_title ?? s.title}
								autofocus
								class="w-full min-w-0 flex-1 rounded-md border border-signal/40 bg-background px-2.5 py-1.5 text-[13.5px] outline-none focus:border-signal"
							/>
							<button
								formaction="?/accept"
								class={`${verbBtn} flex-none`}
								style="border-color:#2f7d5b88;color:#2f7d5b;background:#2f7d5b14;"
							>
								Accept
							</button>
							<button
								formaction="?/edit"
								class={`${verbBtn} flex-none border-input text-muted-foreground hover:border-signal/50`}
							>
								Save
							</button>
							<button
								type="button"
								onclick={() => (editing = null)}
								class="flex-none cursor-pointer font-mono text-[10.5px] text-muted-foreground underline decoration-dotted underline-offset-2"
							>
								cancel
							</button>
						</form>
					{:else}
						<div class="mt-1.5 text-[14.5px] font-medium leading-snug">
							{s.edited_title ?? s.title}
						</div>
					{/if}
					<div class="mt-1 font-mono text-[9.5px] text-muted-foreground">
						why: {s.why || '—'} · via {laneOf(s.source)}
					</div>
				</div>
			{:else}
				<div class="px-5 py-6 font-mono text-[11px] text-muted-foreground">
					queue clear — next rules pass at the top of the hour
				</div>
			{/each}

			<footer class="flex items-center justify-between px-5 py-2.5">
				<span class="font-mono text-[9px] text-muted-foreground/70">
					{pending.length} pending
					{#if data.assist.last_pass.rules}
						· last rules pass {timeShort(data.assist.last_pass.rules)}
					{/if}
				</span>
				<form method="POST" action="?/run" use:enhance={done}>
					<button
						class="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-signal transition-colors hover:text-signal/80"
					>
						<Play class="size-3" /> run pass now
					</button>
				</form>
			</footer>
		</section>

		<div class="flex flex-col gap-4">
			<!-- What actually runs, where — no aspirational model cards. -->
			<section class="overflow-hidden rounded-[12px] border bg-card">
				<header class="border-b px-4 py-3">
					<span class={cardLabel}>Sources</span>
				</header>
				<div class="flex flex-col gap-2 px-4 py-3 font-mono text-[10.5px]">
					<div class="flex justify-between gap-2">
						<span class="text-muted-foreground">rules v1</span>
						<span>local · hourly + on demand</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="text-muted-foreground">claude</span>
						<span>cloud · via /assist-pass</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="text-muted-foreground">qwen3-4b</span>
						<span class="text-muted-foreground/70">planned · local</span>
					</div>
					<div class="mt-1 flex justify-between gap-2 border-t pt-2">
						<span class="text-muted-foreground">reads</span>
						<span>todos · projects · notes · events</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="text-muted-foreground">writes</span>
						<span>suggestions table only</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="text-muted-foreground">money</span>
						{#if data.assist.db_guard}
							<span style="color:#2f7d5b;">local only — db-enforced</span>
						{:else}
							<span style="color:#c68a1a;">role missing — run scripts/assist_role.sql</span>
						{/if}
					</div>
				</div>
			</section>

			<section class="overflow-hidden rounded-[12px] border bg-card">
				<header class="border-b px-4 py-3">
					<span class={cardLabel}>Recent passes</span>
				</header>
				<div class="flex flex-col gap-1.5 px-4 py-3 font-mono text-[10px] text-muted-foreground">
					{#each data.passes as p (p.id)}
						<div class="flex items-baseline gap-2">
							<span class="flex-none text-muted-foreground/60">{timeShort(p.at)}</span>
							<span class="min-w-0 flex-1 truncate">
								{p.source} · scanned {scannedLine(p.scanned)}
							</span>
							<span class="flex-none" class:text-signal={p.created > 0}>
								{p.created ? `${p.created} new` : 'no changes'}
							</span>
						</div>
					{:else}
						<div class="py-1">No passes recorded yet.</div>
					{/each}
				</div>
			</section>
		</div>
	</div>
</div>
