<script lang="ts">
	// The control strip below the masthead: sort, group-by, per-field filters,
	// hide-done, and the column picker. The view switcher itself lives in the
	// page header. Every control except the column picker writes to the URL.
	import type { Column, Item, ModuleConfig } from '$lib/types';
	import type { ViewState } from '$lib/views';
	import { facet, NONE } from '$lib/views';
	import { statusColor } from '$lib/status';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import Filter from '@lucide/svelte/icons/filter';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	let {
		mod,
		viewState,
		items,
		visible,
		update,
		toggleColumn
	}: {
		mod: ModuleConfig;
		viewState: ViewState;
		items: Item[]; // unfiltered, so facet counts don't shift as you filter
		visible: Column[];
		update: (patch: Partial<ViewState>) => void;
		toggleColumn: (field: string) => void;
	} = $props();

	const label = (field: string) =>
		mod.columns.find((c) => c.field === field)?.header ??
		mod.fields.find((f) => f.name === field)?.label ??
		field;

	// Fields offered as filters: whatever the module declares groupable, minus
	// free-text date fields (the date filter is the group/calendar view's job).
	const filterFields = $derived(
		(mod.groupFields ?? []).filter((f) => !mod.fields.find((s) => s.name === f && s.type.includes('date')))
	);

	const activeFilterCount = $derived(
		Object.values(viewState.filters).reduce((n, v) => n + v.length, 0)
	);

	function toggleFilter(field: string, value: string) {
		const current = viewState.filters[field] ?? [];
		const next = current.includes(value)
			? current.filter((v) => v !== value)
			: [...current, value];
		const filters = { ...viewState.filters };
		if (next.length) filters[field] = next;
		else delete filters[field];
		update({ filters });
	}

	const sortable = $derived(visible.filter((c) => c.field !== 'tags'));
	const canHideDone = $derived(Boolean(mod.statusField && mod.doneValues?.length));
</script>

<div class="flex flex-wrap items-center gap-2">
	<!-- sort (table has clickable headers, but this keeps sorting reachable everywhere) -->
	{#if sortable.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="gap-1.5">
						<ArrowUpDown class="size-3.5" />
						<span class="font-mono text-[11px]">
							{viewState.sort ? label(viewState.sort) : 'Sort'}
							{#if viewState.sort}<span class="text-muted-foreground">
									{viewState.dir === 'asc' ? '↑' : '↓'}</span
								>{/if}
						</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-52">
				<DropdownMenu.Label class="font-mono text-[10px] uppercase tracking-[0.12em]">
					Sort by
				</DropdownMenu.Label>
				{#each sortable as col (col.field)}
					<DropdownMenu.Item
						onSelect={() =>
							update({
								sort: col.field,
								dir: viewState.sort === col.field && viewState.dir === 'asc' ? 'desc' : 'asc'
							})}
					>
						<span class="flex-1">{col.header}</span>
						{#if viewState.sort === col.field}
							<span class="font-mono text-xs text-signal">{viewState.dir === 'asc' ? '↑' : '↓'}</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- group-by: drives the grouped view, and the board's columns -->
	{#if (viewState.view === 'group' || viewState.view === 'board') && (mod.groupFields ?? []).length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="gap-1.5">
						<Rows3 class="size-3.5" />
						<span class="font-mono text-[11px]">
							Group: {viewState.group ? label(viewState.group) : 'none'}
						</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-52">
				<DropdownMenu.Label class="font-mono text-[10px] uppercase tracking-[0.12em]">
					Group by
				</DropdownMenu.Label>
				{#each mod.groupFields ?? [] as field (field)}
					<DropdownMenu.Item onSelect={() => update({ group: field })}>
						<span class="flex-1">{label(field)}</span>
						{#if viewState.group === field}<Check class="size-3.5 text-signal" />{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- filters -->
	{#if filterFields.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant={activeFilterCount ? 'secondary' : 'outline'}
						size="sm"
						class="gap-1.5"
					>
						<Filter class="size-3.5" />
						<span class="font-mono text-[11px]">
							Filter{activeFilterCount ? ` · ${activeFilterCount}` : ''}
						</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="max-h-[70vh] w-60 overflow-y-auto">
				{#each filterFields as field, i (field)}
					{#if i > 0}<DropdownMenu.Separator />{/if}
					<DropdownMenu.Label class="font-mono text-[10px] uppercase tracking-[0.12em]">
						{label(field)}
					</DropdownMenu.Label>
					{#each facet(items, field) as f (f.value)}
						<DropdownMenu.Item
							closeOnSelect={false}
							onSelect={() => toggleFilter(field, f.value)}
						>
							<span
								class="flex size-3.5 items-center justify-center rounded-[4px] border
								{(viewState.filters[field] ?? []).includes(f.value)
									? 'border-signal bg-signal text-background'
									: 'border-input'}"
							>
								{#if (viewState.filters[field] ?? []).includes(f.value)}
									<Check class="size-2.5" />
								{/if}
							</span>
							{#if field === mod.statusField && statusColor(mod, f.value)}
								<span
									class="size-[7px] shrink-0 rounded-full"
									style="background:{statusColor(mod, f.value)};"
								></span>
							{/if}
							<span class="flex-1 truncate {f.value === NONE ? 'text-muted-foreground' : ''}">
								{f.value}
							</span>
							<span class="font-mono text-[10px] text-muted-foreground">{f.count}</span>
						</DropdownMenu.Item>
					{/each}
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- hide done -->
	{#if canHideDone}
		<Button
			variant={viewState.hideDone ? 'secondary' : 'outline'}
			size="sm"
			class="gap-1.5 font-mono text-[11px]"
			onclick={() => update({ hideDone: !viewState.hideDone })}
		>
			{viewState.hideDone ? 'Done hidden' : 'Hide done'}
		</Button>
	{/if}

	<!-- column picker -->
	{#if viewState.view === 'table'}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="gap-1.5">
						<SlidersHorizontal class="size-3.5" />
						<span class="font-mono text-[11px]">Columns</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label class="font-mono text-[10px] uppercase tracking-[0.12em]">
					Columns
				</DropdownMenu.Label>
				{#each mod.columns as col (col.field)}
					{@const shown = visible.some((c) => c.field === col.field)}
					{@const isTitle = col.field === mod.titleField}
					<DropdownMenu.Item
						closeOnSelect={false}
						disabled={isTitle}
						onSelect={() => !isTitle && toggleColumn(col.field)}
					>
						<span
							class="flex size-3.5 items-center justify-center rounded-[4px] border
							{shown ? 'border-signal bg-signal text-background' : 'border-input'}"
						>
							{#if shown}<Check class="size-2.5" />{/if}
						</span>
						<span class="flex-1">{col.header}</span>
						{#if isTitle}
							<span class="font-mono text-[9px] uppercase text-muted-foreground">fixed</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>

<!-- active filter chips -->
{#if activeFilterCount}
	<div class="mt-2 flex flex-wrap items-center gap-1.5">
		{#each Object.entries(viewState.filters) as [field, values] (field)}
			{#each values as value (value)}
				<button
					type="button"
					onclick={() => toggleFilter(field, value)}
					class="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-signal/50 hover:text-foreground"
				>
					<span class="uppercase tracking-[0.1em]">{label(field)}</span>
					<span class="text-foreground">{value}</span>
					<X class="size-3" />
				</button>
			{/each}
		{/each}
		<button
			type="button"
			onclick={() => update({ filters: {} })}
			class="px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
		>
			Clear all
		</button>
	</div>
{/if}
