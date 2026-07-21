<script lang="ts">
	// Month grid over the module's date field. Records without a date can't be
	// placed, so they're collected into a footer list rather than dropped — for
	// todos that's the majority of the set, and silently hiding them would make
	// the view lie about how much work there is.
	import type { Column, Item, ModuleConfig } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { statusColor } from '$lib/status';
	import RecordCard from './RecordCard.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		items,
		mod,
		columns,
		month,
		setMonth
	}: {
		items: Item[];
		mod: ModuleConfig;
		columns: Column[];
		month: string | null; // 'YYYY-MM'
		setMonth: (m: string | null) => void;
	} = $props();

	const field = $derived(mod.dateField as string);
	const todayISO = new Date().toISOString().slice(0, 10);

	// Cursor defaults to the current month.
	const cursor = $derived.by(() => {
		const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayISO.slice(0, 7);
		const [y, mo] = m.split('-').map(Number);
		return { y, m: mo };
	});

	const dateOf = (it: Item) => {
		const v = it[field];
		return v == null ? null : String(v).slice(0, 10);
	};

	const undated = $derived(items.filter((it) => !dateOf(it)));

	const byDate = $derived.by(() => {
		const map = new Map<string, Item[]>();
		for (const it of items) {
			const d = dateOf(it);
			if (!d) continue;
			const list = map.get(d);
			if (list) list.push(it);
			else map.set(d, [it]);
		}
		return map;
	});

	// Weeks of the visible month, padded to whole Sunday-start rows.
	const weeks = $derived.by(() => {
		const first = new Date(cursor.y, cursor.m - 1, 1);
		const start = new Date(first);
		start.setDate(1 - first.getDay());
		const out: { iso: string; day: number; inMonth: boolean }[][] = [];
		const d = new Date(start);
		for (let w = 0; w < 6; w++) {
			const row = [];
			for (let i = 0; i < 7; i++) {
				// Local-time ISO: toISOString() would shift days in western zones.
				const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
					d.getDate()
				).padStart(2, '0')}`;
				row.push({ iso, day: d.getDate(), inMonth: d.getMonth() === cursor.m - 1 });
				d.setDate(d.getDate() + 1);
			}
			out.push(row);
			// Stop once we've covered the month and closed the week.
			if (d.getMonth() !== cursor.m - 1 && d > new Date(cursor.y, cursor.m - 1 + 1, 0)) break;
		}
		return out;
	});

	const monthLabel = $derived(
		new Date(cursor.y, cursor.m - 1, 1).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		})
	);

	function shift(delta: number) {
		const d = new Date(cursor.y, cursor.m - 1 + delta, 1);
		setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
	}

	const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="mb-3 flex items-center gap-2">
	<Button variant="outline" size="sm" onclick={() => shift(-1)} aria-label="Previous month">
		<ChevronLeft class="size-4" />
	</Button>
	<Button variant="outline" size="sm" onclick={() => shift(1)} aria-label="Next month">
		<ChevronRight class="size-4" />
	</Button>
	<span class="font-mono text-sm tracking-tight">{monthLabel}</span>
	<Button variant="ghost" size="sm" class="font-mono text-[11px]" onclick={() => setMonth(null)}>
		Today
	</Button>
</div>

<div class="overflow-hidden rounded-[12px] border bg-card">
	<div class="grid grid-cols-7 border-b">
		{#each DOW as d (d)}
			<div class="px-3 py-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
				{d}
			</div>
		{/each}
	</div>
	{#each weeks as week, wi (wi)}
		<div class="grid grid-cols-7 {wi > 0 ? 'border-t' : ''}">
			{#each week as cell (cell.iso)}
				{@const dayItems = byDate.get(cell.iso) ?? []}
				<div
					class="min-h-24 border-r p-1.5 last:border-r-0 {cell.inMonth ? '' : 'bg-muted/30'}
					{cell.iso === todayISO ? 'bg-signal/5' : ''}"
				>
					<div
						class="mb-1 font-mono text-[10px] {cell.iso === todayISO
							? 'font-semibold text-signal'
							: cell.inMonth
								? 'text-muted-foreground'
								: 'text-muted-foreground/50'}"
					>
						{cell.day}
					</div>
					<div class="flex flex-col gap-1">
						{#each dayItems.slice(0, 3) as item (item.id)}
							{@const color = mod.statusField ? statusColor(mod, item[mod.statusField]) : null}
							<a
								href={`/${mod.key}/${item.id}`}
								class="flex items-center gap-1.5 truncate rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:bg-accent hover:text-signal"
								title={String(item[mod.titleField] ?? '')}
							>
								{#if color}
									<span class="size-1.5 shrink-0 rounded-full" style="background:{color};"></span>
								{/if}
								<span class="truncate">
									{String(item[mod.titleField] ?? '') || '(untitled)'}
								</span>
							</a>
						{/each}
						{#if dayItems.length > 3}
							<span class="px-1 font-mono text-[10px] text-muted-foreground">
								+{dayItems.length - 3} more
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/each}
</div>

{#if undated.length}
	<section class="mt-5">
		<h2 class="mb-2 border-b pb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
			No date · {undated.length}
		</h2>
		<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
			{#each undated as item (item.id)}
				<RecordCard {item} {mod} {columns} compact />
			{/each}
		</div>
	</section>
{/if}
