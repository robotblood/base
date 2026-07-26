<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		ago,
		bytes,
		since,
		CHECK_LABELS,
		CHECK_LEVEL,
		LEVEL_COLOR,
		LEVEL_LABEL,
		LEVEL_RANK,
		type Level
	} from '$lib/admin';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const host = $derived(data.host);
	const db = $derived(data.api?.db ?? null);
	const apiUp = $derived(Boolean(data.api));

	// The API is a service like any other, but systemd only knows whether the
	// process is running — not whether it answers. Both facts land on one card.
	const services = $derived([
		...host.units.map((u) => ({
			key: u.unit,
			label: u.label,
			level: (u.unit === 'base-api' && u.state === 'ok' && !apiUp
				? 'warn'
				: u.state) as Level,
			detail:
				u.unit === 'base-api' && u.state === 'ok' && !apiUp
					? 'running but not responding'
					: `${u.active}${u.sub ? ` · ${u.sub}` : ''}`,
			// ExecMainStartTimestamp survives the process, so an uptime is only
			// meaningful while the unit is actually up.
			meta: u.state === 'ok' && u.since ? `up ${since(u.since)}` : '',
			restarts: u.restarts,
			log: u.log
		})),
		{
			key: 'base-db',
			label: 'Database (Postgres, Docker)',
			level: host.container.state as Level,
			detail: `${host.container.status}${host.container.health && host.container.health !== 'none' ? ` · ${host.container.health}` : ''}`,
			meta:
				host.container.state === 'ok' && host.container.since
					? `up ${since(host.container.since)}`
					: '',
			restarts: host.container.restarts,
			log: undefined as string | undefined
		}
	]);

	// The self-check results, worst first. `check.run` is the runner's own
	// summary line rather than a check, so it's pulled out to date the run
	// instead of being listed alongside the things it summarises.
	const lastRun = $derived(data.log?.checks?.['check.run'] ?? null);
	const checks = $derived.by(() => {
		const all = Object.entries(data.log?.checks ?? {})
			.filter(([event]) => event !== 'check.run')
			.map(([event, entry]) => ({
				name: event.replace(/^check\./, ''),
				label: CHECK_LABELS[event.replace(/^check\./, '')] ?? event,
				level: CHECK_LEVEL[entry.detail?.status ?? ''] ?? ('unknown' as Level),
				message: entry.message,
				at: entry.at
			}));
		return all.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
	});
	const failingChecks = $derived(checks.filter((c) => c.level !== 'ok').length);

	// The headline counts the recorded checks alongside the live readings. A
	// page that says "all systems nominal" directly above a warning check is
	// worse than no headline at all.
	const worst = $derived.by(() => {
		const levels: Level[] = [
			...services.map((s) => s.level),
			host.backups.state as Level,
			...host.disks.map((d) => d.state as Level),
			(db?.ok ? 'ok' : 'down') as Level,
			...checks.map((c) => c.level)
		];
		return levels.sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0] ?? 'unknown';
	});

	const problems = $derived(
		services.filter((s) => s.level !== 'ok').length +
			(host.backups.state !== 'ok' ? 1 : 0) +
			host.disks.filter((d) => d.state !== 'ok').length +
			failingChecks
	);

	const paths = $derived(form?.paths ?? null);
	let checkingPaths = $state(false);
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	}

	const card = 'rounded-[12px] border bg-card';
	const cardHead =
		'flex items-center justify-between gap-3 border-b px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground';
</script>

<svelte:head><title>base — admin · health</title></svelte:head>

{#snippet dot(level: Level, size = 8)}
	<span
		class="inline-block shrink-0 rounded-full"
		style={`width:${size}px;height:${size}px;background:${LEVEL_COLOR[level]}`}
		title={LEVEL_LABEL[level]}
	></span>
{/snippet}

{#snippet row(label: string, value: string)}
	<div class="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
		<span class="text-muted-foreground">{label}</span>
		<span class="font-mono text-[12px] tabular-nums">{value}</span>
	</div>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="ADMIN / HEALTH"
		title={worst === 'ok'
			? 'All systems nominal.'
			: `${problems || 1} ${problems === 1 ? 'thing needs' : 'things need'} a look`}
		subtitle={`checked ${new Date(host.checked_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · ${data.apiBase}`}
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={refresh} disabled={refreshing}>
				<RefreshCw class={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	<!-- Self-checks. Everything below this card is a live reading taken when the
	     page loaded; this is the standing record, written every 15 minutes by
	     base-selfcheck.timer whether or not anyone is looking. -->
	<div class={`${card} mb-4`}>
		<div class={cardHead}>
			<span class="flex items-center gap-2">
				{@render dot(
					(checks.length === 0
						? 'unknown'
						: checks.some((c) => c.level === 'down')
							? 'down'
							: failingChecks
								? 'warn'
								: 'ok') as Level
				)}
				Self-checks
			</span>
			<span class="normal-case tracking-normal">
				{#if lastRun}
					ran {ago(lastRun.at)} · every 15 min
				{:else}
					never run
				{/if}
			</span>
		</div>
		{#if checks.length === 0}
			<p class="px-5 py-4 text-[13px] text-muted-foreground">
				No results yet. The timer runs every 15 minutes, or run it now:
				<code class="font-mono text-[12px]">
					~/base/.venv/bin/python ~/base/scripts/selfcheck.py
				</code>
			</p>
		{:else}
			<div class="divide-y">
				{#each checks as c (c.name)}
					<div class="flex items-baseline gap-3 px-5 py-2.5">
						{@render dot(c.level)}
						<span class="w-56 shrink-0 text-[13px] font-medium">{c.label}</span>
						<span class="min-w-0 flex-1 text-[12px] text-muted-foreground">{c.message}</span>
					</div>
				{/each}
			</div>
			<p class="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
				{checks.length} checks · {failingChecks || 'none'}
				{failingChecks ? 'needing attention' : 'failing'} · a new failure raises a desktop
				notification
			</p>
		{/if}
	</div>

	<!-- Services: the four processes base needs to be alive. -->
	<div class="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
		{#each services as s (s.key)}
			<div class={`${card} px-4 py-3.5`}>
				<div class="mb-2 flex items-center gap-2">
					{@render dot(s.level, 9)}
					<span class="truncate text-[13px] font-semibold">{s.label}</span>
				</div>
				<div class="font-mono text-[11px] text-muted-foreground">
					{s.detail}
					{#if s.meta}<span class="opacity-70"> · {s.meta}</span>{/if}
				</div>
				{#if s.restarts > 0}
					<div class="mt-1 font-mono text-[11px] text-destructive">
						{s.restarts} restart{s.restarts === 1 ? '' : 's'}
					</div>
				{/if}
				{#if s.log}
					<pre
						class="mt-2.5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-[7px] bg-muted p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">{s.log}</pre>
				{/if}
			</div>
		{/each}
	</div>


	<!-- Two columns that flow independently rather than a grid of equal-height
	     rows: storage on the left, the database and its derived cache on the
	     right, so a short card doesn't leave a hole under itself. -->
	<div class="mb-4 grid items-start gap-4 lg:grid-cols-2">
		<div class="flex flex-col gap-4">
			<!-- Backups first: this is the check that fails silently. -->
			<div class={card}>
				<div class={cardHead}>
					<span class="flex items-center gap-2">
						{@render dot(host.backups.state as Level)} Backups
					</span>
					<span class="normal-case tracking-normal">{host.backups.dir}</span>
				</div>
				{#if host.backups.newest}
					<div class="border-b px-5 py-4">
						<div class="text-[26px] font-extrabold tabular-nums tracking-tight">
							{since(host.backups.newest.at)}
							<span class="text-[13px] font-medium text-muted-foreground">since last snapshot</span>
						</div>
						<div class="mt-1 font-mono text-[11px] text-muted-foreground">
							{host.backups.newest.name} · {bytes(host.backups.newest.bytes)}
						</div>
					</div>
					<div class="divide-y">
						{@render row(
							'Snapshots',
							`${host.backups.count} daily · ${host.backups.monthly} monthly`
						)}
						{@render row('Total size', bytes(host.backups.total_bytes))}
						{@render row(
							'Next run',
							host.backups.next_run
								? `${since(host.backups.next_run)} (${new Date(host.backups.next_run).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`
								: 'timer not scheduled'
						)}
					</div>
				{:else}
					<p class="px-5 py-4 text-sm text-destructive">
						{host.backups.note || 'No snapshots found.'}
					</p>
				{/if}
				{#if host.backups.note && host.backups.newest}
					<p class="border-t px-5 py-2.5 font-mono text-[11px] text-destructive">
						{host.backups.note}
					</p>
				{/if}
				<p class="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
					bash ~/base/scripts/backup.sh
				</p>
			</div>

			<!-- Disk: the backups are only as safe as the volume under them. -->
			<div class={card}>
				<div class={cardHead}>
					<span class="flex items-center gap-2"><HardDrive class="size-3.5" /> Disk</span>
				</div>
				<div class="divide-y">
					{#each host.disks as d (d.path)}
						<div class="px-5 py-3.5">
							<div class="mb-2 flex items-baseline justify-between gap-3">
								<span class="flex items-center gap-2 text-sm">
									{@render dot(d.state as Level)}
									{d.label}
								</span>
								<span class="font-mono text-[12px] tabular-nums text-muted-foreground">
									{bytes(d.free_bytes)} free of {bytes(d.total_bytes)}
								</span>
							</div>
							<div class="h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full transition-all"
									style={`width:${Math.min(d.used_pct, 100)}%;background:${LEVEL_COLOR[d.state as Level]}`}
								></div>
							</div>
							<div class="mt-1.5 font-mono text-[10px] text-muted-foreground">
								{d.used_pct}% used · {d.path}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Caches: derived data, safe to lose, worth watching for size. -->
			<div class={card}>
				<div class={cardHead}><span>Thumbnail &amp; waveform cache</span></div>
				<div class="divide-y">
					{@render row('Size', bytes(host.cache.bytes))}
					{@render row('Entries', host.cache.files.toLocaleString())}
				</div>
				<p class="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
					{host.cache.dir}
				</p>
				<p class="px-5 pb-3 text-[12px] text-muted-foreground">
					Regenerated on demand — deleting this directory costs nothing but time.
				</p>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<!-- Database: reachability plus what it is actually holding. -->
			<div class={card}>
				<div class={cardHead}>
					<span class="flex items-center gap-2">
						{@render dot((db?.ok ? 'ok' : 'down') as Level)} Database
					</span>
					<span class="normal-case tracking-normal">
						{db?.ok ? `postgres ${db.version}` : 'unreachable'}
					</span>
				</div>
				{#if db?.ok}
					<div class="divide-y">
						{@render row('Size', bytes(db.size_bytes))}
						{@render row('Connections', `${db.connections} / ${db.max_connections}`)}
						{@render row('Uptime', since(db.started_at))}
						{@render row('Query time', `${db.query_ms} ms`)}
					</div>
					<div class="border-t px-5 py-3">
						<div class="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
							Tables
						</div>
						<div class="max-h-72 overflow-auto">
							<table class="w-full text-[12px]">
								<tbody class="divide-y">
									{#each db.tables ?? [] as t (t.table)}
										<tr>
											<td class="py-1.5 pr-3">{t.table}</td>
											<td class="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
												{t.est_rows.toLocaleString()}
											</td>
											<td class="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
												{bytes(t.bytes)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="mt-2 font-mono text-[10px] text-muted-foreground">
							Row counts are planner estimates — exact counts live in the sidebar.
						</p>
					</div>
				{:else}
					<div class="px-5 py-4">
						<p class="text-sm text-destructive">
							{data.api ? (db?.error ?? 'Database unreachable.') : 'API unreachable — cannot query.'}
						</p>
						<p class="mt-2 font-mono text-[11px] text-muted-foreground">
							docker compose -f ~/base/docker-compose.yml up -d
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- File paths: on demand, because it stats every referenced folder. -->
	<div class={card}>
		<div class={cardHead}>
			<span>Linked folders</span>
			<form
				method="POST"
				action="?/paths"
				class="font-sans tracking-normal normal-case"
				use:enhance={() => {
					checkingPaths = true;
					return async ({ update }) => {
						await update({ reset: false });
						checkingPaths = false;
					};
				}}
			>
				<Button type="submit" variant="outline" size="sm" disabled={checkingPaths}>
					{checkingPaths ? 'Checking…' : 'Check paths'}
				</Button>
			</form>
		</div>

		{#if !paths}
			<p class="px-5 py-4 text-[13px] text-muted-foreground">
				Projects, hardware, software, people and merch can point at folders on disk. Run the check
				to find rows whose folder has moved or whose drive is unplugged.
			</p>
		{:else if paths.total_broken === 0}
			<p class="px-5 py-4 text-[13px]">
				{@render dot('ok')}
				All {paths.total_with_path} linked folders resolve.
			</p>
		{:else}
			<div class="border-b px-5 py-3.5 text-[13px]">
				<span class="font-semibold text-destructive">{paths.total_broken}</span>
				of {paths.total_with_path} linked folders don't resolve, across
				{paths.groups.length}
				missing {paths.groups.length === 1 ? 'location' : 'locations'}.
			</div>
			<div class="divide-y">
				{#each paths.groups as g (g.root)}
					<div class="px-5 py-3.5">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="flex items-center gap-2 font-mono text-[12px]">
								{@render dot('down')}
								{g.root}
							</span>
							<span class="font-mono text-[11px] text-muted-foreground">
								{g.count} row{g.count === 1 ? '' : 's'} ·
								{Object.entries(g.modules)
									.map(([m, n]) => `${m} ${n}`)
									.join(', ')}
							</span>
						</div>
						<ul class="mt-2 space-y-0.5 pl-4">
							{#each g.sample as s (s.module + s.id)}
								<li class="truncate font-mono text-[11px] text-muted-foreground">
									<a class="hover:text-foreground hover:underline" href={`/${s.module}/${s.id}`}>
										{s.label}
									</a>
									<span class="opacity-60"> — {s.path}</span>
								</li>
							{/each}
							{#if g.count > g.sample.length}
								<li class="font-mono text-[11px] text-muted-foreground opacity-60">
									…and {g.count - g.sample.length} more
								</li>
							{/if}
						</ul>
					</div>
				{/each}
			</div>
			<p class="border-t px-5 py-2.5 text-[12px] text-muted-foreground">
				A whole missing directory usually means an unmounted drive, not {paths.total_broken} bad rows
				— plug it in and re-check before editing anything.
			</p>
		{/if}
	</div>
</div>
