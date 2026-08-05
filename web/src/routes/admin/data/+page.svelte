<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import TableBuilder from './TableBuilder.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const total = $derived(data.groups.reduce((n, g) => n + g.total, 0));
	const setCount = $derived(data.groups.reduce((n, g) => n + g.sets.length, 0));

	// Which builder is open: 'new', a table id, or nothing.
	let building = $state<'new' | number | null>(null);
	let confirmDelete = $state<number | null>(null);
</script>

<svelte:head><title>base — admin · data</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="SYS"
		title="Data"
		subtitle={`${data.tables.length} custom ${data.tables.length === 1 ? 'table' : 'tables'} · ${setCount} imported ${setCount === 1 ? 'database' : 'databases'} (${total} rows)`}
	/>

	<div class="mt-6 max-w-3xl">
		<!-- ============ Custom tables: built here, browsed like any module ============ -->
		<div class="mb-2 flex items-center justify-between">
			<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
				>Tables</span
			>
			<button
				onclick={() => (building = building === 'new' ? null : 'new')}
				class="cursor-pointer rounded-[7px] bg-primary px-3 py-[6px] text-[12px] font-semibold text-primary-foreground hover:opacity-90"
			>
				{building === 'new' ? 'Close' : '+ New table'}
			</button>
		</div>
		<p class="mb-4 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			A table built here gets the full treatment — sidebar entry, table/board/group/calendar
			views, forms, detail pages — from its field list alone. Pick fields from the palette;
			change them any time.
		</p>

		<section class="mb-8 overflow-hidden rounded-[12px] border bg-card">
			{#if building === 'new'}
				<TableBuilder refTargets={data.refTargets} oncancel={() => (building = null)} />
			{/if}
			<div class="divide-y">
				{#each data.tables as t (t.id)}
					<div>
						<div class="flex items-center justify-between gap-3 px-5 py-2.5">
							<a href={`/${t.key}`} class="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
								>{t.name}</a
							>
							<span class="font-mono text-[11px] text-muted-foreground"
								>/{t.key} · {t.fields.length} fields · {t.row_count ?? 0} rows</span
							>
							<button
								onclick={() => (building = building === t.id ? null : t.id)}
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
								>{building === t.id ? 'CLOSE' : 'FIELDS'}</button
							>
							{#if confirmDelete === t.id}
								<form
									method="POST"
									action="?/deleteTable"
									use:enhance={() =>
										async ({ update }) => {
											confirmDelete = null;
											await update();
										}}
								>
									<input type="hidden" name="id" value={t.id} />
									<button
										class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
										title="This deletes the table AND its {t.row_count ?? 0} rows"
										>DELETE {t.row_count ?? 0} ROWS?</button
									>
								</form>
								<button
									onclick={() => (confirmDelete = null)}
									class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
									>keep</button
								>
							{:else}
								<button
									onclick={() => (confirmDelete = t.id)}
									class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
									>DELETE</button
								>
							{/if}
						</div>
						{#if building === t.id}
							<TableBuilder table={t} refTargets={data.refTargets} oncancel={() => (building = null)} />
						{/if}
					</div>
				{:else}
					{#if building !== 'new'}
						<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
							No custom tables yet — build the first one and it shows up in the sidebar.
						</p>
					{/if}
				{/each}
			</div>
		</section>

		<!-- ============ Imported, not yet modelled ============ -->
		<div class="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
			Imported, waiting
		</div>
		<p class="mb-5 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			These came out of the Notion export but don't have a module of their own yet. Every row keeps
			its original columns, so nothing is lost by waiting — when one of these earns a real place in
			the app, promoting it is a normal migration rather than a re-import.
		</p>

		{#each data.groups as g (g.key)}
			<section class="mb-4 overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
						{g.label}
					</span>
					<a
						href={`/${g.key}`}
						class="font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
					>
						{g.total} rows · browse
					</a>
				</div>

				{#if g.error}
					<p class="px-5 py-3.5 text-sm text-destructive">Could not load: {g.error}</p>
				{:else}
					<div class="divide-y">
						{#each g.sets as s (s.name)}
							<a
								href={`/${g.key}?view=group&group=collection&f.collection=${encodeURIComponent(s.name)}`}
								class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
							>
								<span class="min-w-0 truncate text-sm">{s.name}</span>
								<span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
									{s.count}
								</span>
							</a>
						{:else}
							<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">Nothing imported.</p>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<p class="rounded-[12px] border bg-card px-5 py-4 font-mono text-xs text-muted-foreground">
				No hidden modules — everything imported has a place in the sidebar.
			</p>
		{/each}
	</div>
</div>
