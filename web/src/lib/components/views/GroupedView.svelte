<script lang="ts">
	// One list broken into collapsible sections by the current group field.
	// Empty sections are dropped here (unlike the board, where an empty column
	// is still a drop target).
	import type { Column, ModuleConfig } from '$lib/types';
	import type { Group } from '$lib/views';
	import { NONE } from '$lib/views';
	import { statusColor } from '$lib/status';
	import RecordCard from './RecordCard.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		groups,
		mod,
		columns,
		omit = []
	}: {
		groups: Group[];
		mod: ModuleConfig;
		columns: Column[];
		omit?: string[];
	} = $props();

	const shown = $derived(groups.filter((g) => g.items.length));
	let collapsed = $state<Record<string, boolean>>({});
</script>

<div class="flex flex-col gap-4">
	{#each shown as group (group.key)}
		{@const color = statusColor(mod, group.key)}
		<section>
			<button
				type="button"
				onclick={() => (collapsed = { ...collapsed, [group.key]: !collapsed[group.key] })}
				class="mb-3 flex w-full cursor-pointer items-center gap-2 border-b pb-2 text-left"
			>
				<ChevronRight
					class="size-3.5 text-muted-foreground transition-transform {collapsed[group.key]
						? ''
						: 'rotate-90'}"
				/>
				{#if color}
					<span class="size-2 shrink-0 rounded-full" style="background:{color};"></span>
				{/if}
				<span
					class="font-mono text-[11px] uppercase tracking-[0.1em] {group.key === NONE
						? 'text-muted-foreground'
						: 'text-foreground/70'}"
				>
					{group.label}
				</span>
				<span class="font-mono text-[11px] text-muted-foreground">{group.items.length}</span>
			</button>
			{#if !collapsed[group.key]}
				<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{#each group.items as item (item.id)}
						<RecordCard {item} {mod} {columns} {omit} />
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<p class="py-16 text-center font-mono text-xs text-muted-foreground">Nothing to group.</p>
	{/each}
</div>
