<script lang="ts">
	// Kanban board over the current group field. Dragging a card between columns
	// writes the new value through the `setField` action.
	//
	// Only offered when the axis is a single-valued field: dragging onto a tag
	// column would be ambiguous (a record can hold many tags), so the page falls
	// back to the grouped view for those.
	import type { Column, Item, ModuleConfig } from '$lib/types';
	import type { Group as GroupType } from '$lib/views';
	import { NONE } from '$lib/views';
	import { statusColor } from '$lib/status';
	import RecordCard from './RecordCard.svelte';

	let {
		groups,
		mod,
		columns,
		field,
		onmove
	}: {
		groups: GroupType[];
		mod: ModuleConfig;
		columns: Column[];
		field: string; // the board axis — cards skip it, the column header says it
		onmove: (id: number, value: string | null) => void;
	} = $props();

	let dragging = $state<number | null>(null);
	let over = $state<string | null>(null);

	function start(e: DragEvent, item: Item) {
		dragging = item.id;
		e.dataTransfer?.setData('text/plain', String(item.id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function drop(e: DragEvent, group: GroupType) {
		e.preventDefault();
		over = null;
		const id = Number(e.dataTransfer?.getData('text/plain') ?? dragging);
		dragging = null;
		if (!Number.isFinite(id)) return;
		// No-op if it was already in this column.
		if (group.items.some((it) => it.id === id)) return;
		onmove(id, group.key === NONE ? null : group.key);
	}
</script>

<div class="flex items-start gap-4 overflow-x-auto pb-3.5">
	{#each groups as group (group.key)}
		{@const color = statusColor(mod, group.key)}
		<div class="flex w-[254px] flex-none flex-col">
			<!-- Header sits outside the panel, as on the tracker board. -->
			<div class="flex items-center gap-2 px-1 pb-3">
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
			</div>
			<div
				class="flex min-h-[80px] flex-col gap-2.5 rounded-[12px] p-2.5 transition-colors
				{over === group.key ? 'bg-accent ring-1 ring-ring/40' : 'bg-muted'}"
				role="list"
				ondragover={(e) => {
					e.preventDefault();
					over = group.key;
				}}
				ondragleave={() => over === group.key && (over = null)}
				ondrop={(e) => drop(e, group)}
			>
				{#each group.items as item (item.id)}
					<div class={dragging === item.id ? 'opacity-40' : ''}>
						<RecordCard
							{item}
							{mod}
							{columns}
							omit={[field]}
							draggable
							ondragstart={(e) => start(e, item)}
						/>
					</div>
				{:else}
					<p class="px-1 py-6 text-center font-mono text-[10px] text-muted-foreground">
						Drop here
					</p>
				{/each}
			</div>
		</div>
	{/each}
</div>
