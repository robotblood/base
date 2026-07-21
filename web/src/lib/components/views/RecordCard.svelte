<script lang="ts">
	// Compact record tile shared by the board, grouped and calendar views.
	// Follows the tracker's card anatomy: a mono meta line with a state dot on
	// the right, the title, then whichever visible columns carry a value — so a
	// card never renders a row of empty labels.
	import type { Column, Item, ModuleConfig } from '$lib/types';
	import { fmt } from '$lib/format';
	import { isOverdue } from '$lib/views';
	import { statusColor } from '$lib/status';

	let {
		item,
		mod,
		columns,
		omit = [],
		compact = false,
		draggable = false,
		ondragstart
	}: {
		item: Item;
		mod: ModuleConfig;
		columns: Column[];
		omit?: string[]; // fields the container already displays (e.g. its own column header)
		compact?: boolean;
		draggable?: boolean;
		ondragstart?: (e: DragEvent) => void;
	} = $props();

	const title = $derived(String(item[mod.titleField] ?? '') || '(untitled)');
	const dot = $derived(mod.statusField ? statusColor(mod, item[mod.statusField]) : null);

	// Everything except the title, the status (shown as the dot) and whatever
	// the container already says — that actually has a value here.
	const details = $derived(
		columns
			.filter(
				(c) => c.field !== mod.titleField && c.field !== mod.statusField && !omit.includes(c.field)
			)
			.map((c) => ({ col: c, text: fmt(item[c.field]) }))
			.filter((d) => d.text)
	);

	const today = new Date().toISOString().slice(0, 10);
	const overdue = (c: Column) => c.field === mod.overdueField && isOverdue(mod, item, today);
</script>

<a
	href={`/${mod.key}/${item.id}`}
	{draggable}
	{ondragstart}
	class="block rounded-[10px] border bg-card p-[12px_13px] transition-shadow hover:border-ring/40 hover:shadow-[0_3px_12px_rgba(30,28,24,.07)]
	       {draggable ? 'cursor-grab active:cursor-grabbing' : ''}"
>
	{#if dot}
		<div class="flex items-center justify-end">
			<span class="size-2 rounded-full" style="background:{dot};"></span>
		</div>
	{/if}
	<div
		class="text-[14.5px] font-semibold leading-[1.25] {dot ? 'mt-[3px]' : ''} {compact
			? 'line-clamp-1'
			: 'line-clamp-2'}"
	>
		{title}
	</div>
	{#if details.length && !compact}
		<div class="mt-[9px] flex flex-wrap items-center gap-x-2 gap-y-1">
			{#each details as d (d.col.field)}
				{#if d.col.render === 'tags'}
					{#each String(d.text).split(', ') as tag (tag)}
						<span
							class="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
						>
							{tag}
						</span>
					{/each}
				{:else}
					<span
						class="font-mono text-[11px] {overdue(d.col) ? 'text-signal' : 'text-muted-foreground'}"
					>
						{d.text}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
</a>
