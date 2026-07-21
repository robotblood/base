// Label + icon per view kind. Shared so the header's switcher and any other
// affordance can't drift apart.
import type { Component } from 'svelte';
import type { ViewKind } from '$lib/types';
import Table2 from '@lucide/svelte/icons/table-2';
import Columns3 from '@lucide/svelte/icons/columns-3';
import Rows3 from '@lucide/svelte/icons/rows-3';
import CalendarDays from '@lucide/svelte/icons/calendar-days';

export const VIEW_META: Record<ViewKind, { label: string; icon: Component }> = {
	table: { label: 'Table', icon: Table2 as Component },
	board: { label: 'Board', icon: Columns3 as Component },
	group: { label: 'Grouped', icon: Rows3 as Component },
	calendar: { label: 'Calendar', icon: CalendarDays as Component }
};
