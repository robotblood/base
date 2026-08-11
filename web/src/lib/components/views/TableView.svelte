<script lang="ts">
	// The record table. Every header sorts — click to sort ascending, click the
	// active one again to flip direction.
	//
	// Plain <table> rather than the shadcn wrapper: the tracker's row rhythm
	// (px-5 / py-3.5) fights the component's built-in padding, and a real table
	// still handles a variable column count better than the tracker's
	// fixed-width flex rows.
	import type { Column, Item, ModuleConfig } from '$lib/types';
	import type { ViewState } from '$lib/views';
	import { isDone, isOverdue } from '$lib/views';
	import { isStatusField } from '$lib/status';
	import { fmt } from '$lib/format';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import FieldMenu from '$lib/components/views/FieldMenu.svelte';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let {
		items,
		mod,
		columns,
		viewState,
		update,
		empty
	}: {
		items: Item[];
		mod: ModuleConfig;
		columns: Column[];
		viewState: ViewState;
		update: (patch: Partial<ViewState>) => void;
		empty: string;
	} = $props();

	const today = new Date().toISOString().slice(0, 10);
	// Tint only the deadline cell itself, and only on a genuinely overdue row.
	const overdueCell = (item: Item, col: Column) =>
		col.field === mod.overdueField && isOverdue(mod, item, today);

	function sortBy(field: string) {
		update({
			sort: field,
			dir: viewState.sort === field && viewState.dir === 'asc' ? 'desc' : 'asc'
		});
	}

	// Every table edits its schema right here: a pencil on each editable
	// field's header, a "+" column at the far right. On a custom table that is
	// everything but the pinned title; on a built-in module it is the fields
	// the user added (spec.ext) — code-defined columns have no pencil.
	const editableSpec = (field: string) => {
		const spec = mod.fields.find((f) => f.name === field);
		if (!spec) return null;
		return (mod.custom ? spec.name !== mod.titleField : !!spec.ext) ? spec : null;
	};
</script>

<div class="overflow-x-auto rounded-[12px] border bg-card">
	<table class="w-full border-collapse">
		<thead>
			<tr class="border-b">
				{#each columns as col (col.field)}
					{@const spec = editableSpec(col.field)}
					<!-- The title column absorbs the slack so every other column sizes
					     to its content instead of wrapping in a squeezed cell. -->
					<th
						class="group p-0 text-left font-normal {col.field === mod.titleField
							? 'w-full'
							: 'whitespace-nowrap'}"
					>
						<div class="flex items-center {spec ? 'pr-2' : ''}">
							<button
								type="button"
								onclick={() => sortBy(col.field)}
								class="flex w-full cursor-pointer items-center gap-1 px-5 py-3 text-left font-mono text-[10px] tracking-[0.12em] transition-colors hover:text-foreground
								{viewState.sort === col.field ? 'text-signal' : 'text-muted-foreground'} {spec ? 'pr-1' : ''}"
							>
								{col.header.toUpperCase()}
								{#if viewState.sort === col.field}
									{#if viewState.dir === 'asc'}
										<ChevronUp class="size-3" />
									{:else}
										<ChevronDown class="size-3" />
									{/if}
								{/if}
							</button>
							{#if spec}
								<FieldMenu {spec} />
							{/if}
						</div>
					</th>
				{/each}
				<!-- Notion-style: the last header cell grows the schema in place. -->
				<th class="w-0 whitespace-nowrap p-0 text-left font-normal">
					<FieldMenu />
				</th>
			</tr>
		</thead>
		<tbody>
			{#each items as item (item.id)}
				<tr
					class="border-b transition-colors last:border-b-0 hover:bg-accent {isDone(mod, item)
						? 'opacity-55'
						: ''}"
				>
					{#each columns as col (col.field)}
						{@const text = fmt(item[col.field])}
						<td
							class="px-5 py-3.5 align-middle {col.field === mod.titleField
								? ''
								: 'whitespace-nowrap'}"
						>
							{#if col.field === mod.titleField}
								<a
									href={`/${mod.key}/${item.id}`}
									class="text-[14px] font-semibold underline-offset-2 hover:text-signal hover:underline"
								>
									{text || '(untitled)'}
								</a>
							{:else if isStatusField(mod, col.field) && text}
								<StatusDot {mod} value={text} showLabel />
							{:else if col.render === 'tags' && text}
								<!-- Single line: a wrapping tag list makes row heights ragged. -->
								<span class="flex gap-1">
									{#each text.split(', ') as tag (tag)}
										<span
											class="rounded-[5px] bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground"
										>
											{tag}
										</span>
									{/each}
								</span>
							{:else if col.render === 'badge' && text}
								<span
									class="rounded-[5px] bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground"
								>
									{text}
								</span>
							{:else if overdueCell(item, col)}
								<span class="font-mono text-[12px] text-signal">{text}</span>
							{:else}
								<span class="text-[12px] text-muted-foreground">{text}</span>
							{/if}
						</td>
					{/each}
					<td></td>
				</tr>
			{:else}
				<tr>
					<td
						colspan={columns.length + 1}
						class="h-24 text-center font-mono text-xs text-muted-foreground"
					>
						{empty}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
