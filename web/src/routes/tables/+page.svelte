<script lang="ts">
	// The index of every table in the system. The rail shows categories; this
	// page shows everything — built-ins by category, the library shelves,
	// user-built tables, and the imported databases still waiting for a model.
	import type { PageData } from './$types';
	import { VIEW_META } from '$lib/components/chrome/viewMeta';
	import type { ViewKind } from '$lib/types';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Hammer from '@lucide/svelte/icons/hammer';
	import Search from '@lucide/svelte/icons/search';

	let { data }: { data: PageData } = $props();

	let q = $state('');

	// One flat filter over every group — the search answers "where does X
	// live", so it matches against label, key, and code alike.
	const shown = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return data.groups;
		return data.groups
			.map((g) => ({
				...g,
				rows: g.rows.filter((r) =>
					[r.label, r.key, r.code].some((s) => s.toLowerCase().includes(needle))
				)
			}))
			.filter((g) => g.rows.length > 0);
	});

	const totalTables = $derived(data.groups.reduce((s, g) => s + g.rows.length, 0));
	const totalRows = $derived(
		data.groups.reduce((s, g) => s + g.rows.reduce((x, r) => x + r.count, 0), 0)
	);

	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
</script>

<svelte:head><title>base — tables</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="TBL"
		title="Tables"
		subtitle={`${totalTables} tables · ${totalRows} rows`}
	>
		{#snippet actions()}
			<label
				class="flex min-w-[220px] items-center gap-2 rounded-[10px] border bg-card px-3 py-2 focus-within:border-ring"
			>
				<Search class="size-3.5 flex-none text-muted-foreground" />
				<input
					bind:value={q}
					placeholder="Filter tables…"
					autocomplete="off"
					class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
				/>
			</label>
			<a
				href="/admin/data"
				class="inline-flex items-center gap-2 rounded-[10px] border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-ring/40 hover:bg-accent"
				title="The table builder lives in Admin → Data"
			>
				<Hammer class="size-4" /> New table
			</a>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.error}
		</div>
	{/if}

	<div class="flex flex-col gap-4">
		{#each shown as group (group.key)}
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-baseline justify-between border-b px-5 py-3">
					<span class={cardLabel}>{group.label}</span>
					<span class="font-mono text-[10px] text-muted-foreground/70">{group.blurb}</span>
				</div>
				<div class="divide-y">
					{#each group.rows as r (r.key)}
						<a
							href={r.href}
							class="group flex items-center gap-4 px-5 py-2.5 transition-colors hover:bg-accent"
						>
							<span class="w-14 shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground"
								>{r.code}</span
							>
							<span class="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
							<span class="hidden shrink-0 items-center gap-2 sm:flex">
								{#each r.views as v (v)}
									<span
										class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60"
										title={VIEW_META[v as ViewKind]?.label ?? v}>{v}</span
									>
								{/each}
							</span>
							<span class="w-20 shrink-0 text-right font-mono text-[11px] text-muted-foreground/70"
								>{r.fields} fields</span
							>
							<span
								class={`w-16 shrink-0 text-right font-mono text-[12px] tabular-nums ${
									r.count === 0 ? 'text-muted-foreground/40' : ''
								}`}>{r.count}</span
							>
							<ArrowRight
								class="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-signal"
							/>
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<div class="rounded-[12px] border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
				No table matches “{q}”.
			</div>
		{/each}

		{#if data.imported.length && !q}
			<!-- Imported Notion databases parked in `collections` — reachable, not
			     yet modelled. Each earns a real table (or a purge) eventually; the
			     builder for that lives in Admin → Data. -->
			<div class="overflow-hidden rounded-[12px] border border-dashed bg-card">
				<div class="flex items-baseline justify-between border-b px-5 py-3">
					<span class={cardLabel}>Imported · not yet modelled</span>
					<a
						href="/collections"
						class="font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-signal"
						>open collections</a
					>
				</div>
				<div class="flex flex-wrap gap-2 px-5 py-3.5">
					{#each data.imported as c (c.name)}
						<span
							class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] text-foreground/70"
						>
							{c.name}
							<span class="font-mono text-[10px] tabular-nums text-muted-foreground">{c.count}</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
