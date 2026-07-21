// Sorting / filtering / grouping for the module list views.
//
// Everything here is pure and runs in the browser: `api.list` already returns a
// module's full record set (the largest is ~276 rows), so slicing it locally is
// cheaper and far more responsive than a round trip per sort click. View state
// lives in the URL so a particular slice is shareable and survives reload;
// column visibility is a personal preference and lives in localStorage instead.
import type { Column, Item, ModuleConfig, SortDir, SortKind, ViewKind } from '$lib/types';

export interface ViewState {
	view: ViewKind;
	sort: string | null;
	dir: SortDir;
	group: string | null;
	hideDone: boolean;
	filters: Record<string, string[]>; // field -> accepted values (OR within a field)
	month: string | null; // calendar cursor, 'YYYY-MM'
}

export const NONE = '—'; // display label + group key for empty values

// ---------------------------------------------------------------- URL state

const FILTER_PREFIX = 'f.';

export function viewsFor(mod: ModuleConfig): ViewKind[] {
	return mod.views?.length ? mod.views : ['table'];
}

export function readState(params: URLSearchParams, mod: ModuleConfig): ViewState {
	const available = viewsFor(mod);
	const wanted = params.get('view') as ViewKind | null;
	const view = wanted && available.includes(wanted) ? wanted : available[0];

	const filters: Record<string, string[]> = {};
	for (const [k, v] of params) {
		if (!k.startsWith(FILTER_PREFIX) || !v) continue;
		filters[k.slice(FILTER_PREFIX.length)] = v.split('|').filter(Boolean);
	}

	const dir = params.get('dir');
	return {
		view,
		sort: params.get('sort') ?? mod.defaultSort?.field ?? null,
		dir: dir === 'asc' || dir === 'desc' ? dir : (mod.defaultSort?.dir ?? 'asc'),
		group: params.get('group') ?? defaultGroupField(mod),
		// Completed/archived records hide by default — the lists are for what's
		// current. ?done=1 (the toolbar toggle) brings them back.
		hideDone: params.get('done') !== '1',
		filters,
		month: params.get('month')
	};
}

// Serialise state back into a query string, omitting anything at its default so
// the common case stays a clean URL.
export function writeState(state: ViewState, mod: ModuleConfig, q: string): string {
	const p = new URLSearchParams();
	if (q) p.set('q', q);
	if (state.view !== viewsFor(mod)[0]) p.set('view', state.view);
	if (state.sort && state.sort !== mod.defaultSort?.field) p.set('sort', state.sort);
	if (state.dir !== (mod.defaultSort?.dir ?? 'asc')) p.set('dir', state.dir);
	if (state.group && state.group !== defaultGroupField(mod)) p.set('group', state.group);
	if (!state.hideDone) p.set('done', '1');
	if (state.month) p.set('month', state.month);
	for (const [field, values] of Object.entries(state.filters)) {
		if (values.length) p.set(FILTER_PREFIX + field, values.join('|'));
	}
	const s = p.toString();
	return s ? `?${s}` : '';
}

function defaultGroupField(mod: ModuleConfig): string | null {
	return mod.statusField ?? mod.groupFields?.[0] ?? null;
}

// ------------------------------------------------------------------ sorting

// A column sorts by its declared `sort`, else by the type of the matching form
// field, else as text.
export function sortKindFor(mod: ModuleConfig, col: Column): SortKind {
	if (col.sort) return col.sort;
	const spec = mod.fields.find((f) => f.name === col.field);
	if (spec?.type === 'number') return 'number';
	if (spec?.type === 'date' || spec?.type === 'datetime') return 'date';
	return 'text';
}

function isEmpty(v: unknown): boolean {
	return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// Empty values always sort last regardless of direction — a todo with no due
// date is "unscheduled", not "due first", and flipping direction shouldn't
// bury the rows you can actually act on.
function compare(a: unknown, b: unknown, kind: SortKind, dir: SortDir): number {
	const ae = isEmpty(a);
	const be = isEmpty(b);
	if (ae || be) return ae && be ? 0 : ae ? 1 : -1;

	let r: number;
	if (kind === 'number') {
		r = Number(a) - Number(b);
	} else if (kind === 'date') {
		r = String(a).localeCompare(String(b)); // ISO dates sort lexicographically
	} else {
		const as = Array.isArray(a) ? a.join(', ') : String(a);
		const bs = Array.isArray(b) ? b.join(', ') : String(b);
		r = as.localeCompare(bs, undefined, { sensitivity: 'base', numeric: true });
	}
	if (Number.isNaN(r)) r = 0;
	return dir === 'desc' ? -r : r;
}

export function sortItems(
	items: Item[],
	mod: ModuleConfig,
	field: string | null,
	dir: SortDir
): Item[] {
	if (!field) return items;
	const col = mod.columns.find((c) => c.field === field);
	const kind = col ? sortKindFor(mod, col) : 'text';

	// Completed records sink to the bottom whatever else is going on — sorting
	// by due date otherwise leads with the oldest finished work. Skipped when
	// you're explicitly sorting by the status field, since then the done-ness
	// *is* the thing you asked to order by.
	const sinkDone = field !== mod.statusField;

	// Ties break on the title field so the order is stable and predictable
	// rather than dependent on the API's row order.
	return [...items].sort(
		(x, y) =>
			(sinkDone ? Number(isDone(mod, x)) - Number(isDone(mod, y)) : 0) ||
			compare(x[field], y[field], kind, dir) ||
			compare(x[mod.titleField], y[mod.titleField], 'text', 'asc')
	);
}

// ---------------------------------------------------------------- filtering

// Values a field takes across the record set, with counts, for the filter menus.
export function facet(items: Item[], field: string): { value: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const it of items) {
		const v = it[field];
		const values = Array.isArray(v) ? (v.length ? v.map(String) : [NONE]) : [isEmpty(v) ? NONE : String(v)];
		for (const s of values) counts.set(s, (counts.get(s) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => (a.value === NONE ? 1 : b.value === NONE ? -1 : b.count - a.count));
}

function matches(item: Item, field: string, accepted: string[]): boolean {
	const v = item[field];
	if (Array.isArray(v)) {
		return v.length ? v.some((t) => accepted.includes(String(t))) : accepted.includes(NONE);
	}
	return accepted.includes(isEmpty(v) ? NONE : String(v));
}

export function filterItems(items: Item[], mod: ModuleConfig, state: ViewState): Item[] {
	return items.filter((it) => {
		if (state.hideDone && isDone(mod, it)) return false;
		for (const [field, accepted] of Object.entries(state.filters)) {
			if (accepted.length && !matches(it, field, accepted)) return false;
		}
		return true;
	});
}

// ----------------------------------------------------------------- grouping

export interface Group {
	key: string;
	label: string;
	items: Item[];
}

// Relative buckets for grouping by a date field. Anchored on a passed-in
// "today" so the caller controls the clock (and SSR/CSR agree).
const DAY = 86_400_000;

export function dateBucket(value: unknown, today: Date): string {
	if (isEmpty(value)) return 'No date';
	const d = new Date(String(value).slice(0, 10));
	if (Number.isNaN(d.getTime())) return 'No date';
	const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const days = Math.round((d.getTime() - base.getTime()) / DAY);
	if (days < 0) return 'Overdue';
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	if (days <= 7) return 'This week';
	if (days <= 30) return 'This month';
	return 'Later';
}

const BUCKET_ORDER = [
	'Overdue',
	'Today',
	'Tomorrow',
	'This week',
	'This month',
	'Later',
	'No date',
	'Completed'
];

export function isDateField(mod: ModuleConfig, field: string): boolean {
	const spec = mod.fields.find((f) => f.name === field);
	return spec?.type === 'date' || spec?.type === 'datetime';
}

// Completed per the module's own vocabulary. Modules without a done concept
// (events, hardware, …) are never done.
export function isDone(mod: ModuleConfig, item: Item): boolean {
	if (!mod.statusField || !mod.doneValues?.length) return false;
	return mod.doneValues.includes(String(item[mod.statusField] ?? ''));
}

// Past its deadline and still open. Only meaningful for modules that declare
// an `overdueField`, so a long-past meeting never reads as urgent.
export function isOverdue(mod: ModuleConfig, item: Item, todayISO: string): boolean {
	if (!mod.overdueField) return false;
	const v = item[mod.overdueField];
	if (isEmpty(v)) return false;
	return String(v).slice(0, 10) < todayISO && !isDone(mod, item);
}

// Group into an ordered list. A date field buckets relatively; a select field
// keeps its declared option order (so a board reads Not started -> Done rather
// than alphabetically); anything else orders by size.
export function groupItems(
	items: Item[],
	mod: ModuleConfig,
	field: string,
	today: Date
): Group[] {
	const byKey = new Map<string, Item[]>();
	const push = (k: string, it: Item) => {
		const list = byKey.get(k);
		if (list) list.push(it);
		else byKey.set(k, [it]);
	};

	const dated = isDateField(mod, field);
	// Bucketing a deadline: finished work is never "overdue", so it collects in
	// a trailing Completed bucket instead of inflating the urgent ones.
	const deadline = dated && field === mod.overdueField;
	for (const it of items) {
		const v = it[field];
		if (dated) push(deadline && isDone(mod, it) ? 'Completed' : dateBucket(v, today), it);
		else if (Array.isArray(v)) {
			if (v.length) for (const t of v) push(String(t), it);
			else push(NONE, it);
		} else push(isEmpty(v) ? NONE : String(v), it);
	}

	let order: string[];
	if (dated) {
		order = BUCKET_ORDER.filter((b) => byKey.has(b));
	} else {
		const declared = mod.fields.find((f) => f.name === field)?.options ?? [];
		const seen = [...byKey.keys()];
		// Declared options first (even when empty, so a board shows its columns),
		// then any value the data has that the config doesn't know about.
		const extra = seen
			.filter((k) => !declared.includes(k) && k !== NONE)
			.sort((a, b) => (byKey.get(b)?.length ?? 0) - (byKey.get(a)?.length ?? 0));
		order = [...declared, ...extra];
		if (byKey.has(NONE)) order.push(NONE);
		if (!declared.length) order = order.filter((k) => byKey.has(k));
	}

	return order.map((key) => ({ key, label: key, items: byKey.get(key) ?? [] }));
}
