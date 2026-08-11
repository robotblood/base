// The shape of the sidebar rail.
//
// The rail is a short list of *category pages* — Overview, Projects, Work,
// Calendar, Money, Tables — each a mini dashboard over the tables it fronts.
// The tables themselves are drill-downs: they render indented under their
// category only while you're inside it, so the rail stays seven rows tall
// instead of one row per table. Two things are data here: which category a
// destination belongs to (NAV_CATEGORIES), and which destinations are *views
// over* a table rather than tables themselves (NAV_VIEWS).
import { MODULES, MODULE_CODES } from '$lib/modules';
import type { Stats } from '$lib/types';

// A page that reads one or more tables rather than being one. It has no row
// count of its own — the count belongs to the table it reads — and `of`
// records that relationship so it lives in the model instead of in an `if`.
export interface NavView {
	key: string;
	code: string;
	label: string;
	href: string;
	of: string[]; // module keys this view reads
}

export const NAV_VIEWS: NavView[] = [
	{ key: 'shows', code: 'SHOW', label: 'Shows', href: '/shows', of: ['events'] }
];

export const getView = (key: string): NavView | undefined => NAV_VIEWS.find((v) => v.key === key);

// A category page: one rail slot, one mini dashboard, a handful of tables
// drilled beneath it. `members` are module/view keys shown as drill-downs;
// `fronts` are modules the page itself embodies (the Projects tracker *is*
// the projects table), claimed for the category's count but not repeated as
// children. Anything unclaimed falls to the `tables` category, so a table
// built in Admin → Data has a way in without an edit here.
export interface NavCategoryDef {
	key: string;
	code: string;
	label: string;
	href: string;
	members: string[];
	fronts?: string[];
}

export const NAV_CATEGORIES: NavCategoryDef[] = [
	{ key: 'projects', code: 'PROJ', label: 'Projects', href: '/projects', members: [], fronts: ['projects'] },
	{ key: 'work', code: 'WORK', label: 'Work', href: '/work', members: ['todos', 'notes', 'applications'] },
	{ key: 'calendar', code: 'CAL', label: 'Calendar', href: '/calendar', members: ['shows', 'events'] },
	{ key: 'money', code: 'MONEY', label: 'Money', href: '/money', members: ['transactions', 'budgets', 'merch'] },
	{ key: 'tables', code: 'TBL', label: 'Tables', href: '/tables', members: [] }
];

// Where a module lands when no category claims it. Custom tables and the
// library shelves (hardware, software, media…) all drill under Tables.
const FALLBACK_CATEGORY = 'tables';

export interface NavEntry {
	code: string;
	label: string;
	href: string;
	count: number | null; // null for views and pages, which have no rows of their own
	children?: NavEntry[]; // drill-down tables, rendered only while inside the category
}

export interface NavSection {
	key: string;
	label: string | null; // unlabelled sections are the top and bottom rails
	entries: NavEntry[];
	rule?: boolean; // draw a separator above this section
}

/**
 * The rail, resolved against the current row counts. Hidden modules are left
 * out — they still work by URL and are listed on /tables, they just don't
 * take a slot here. A category's count is the sum of the rows it fronts, so
 * the rail's numbers still add up to the footer total.
 */
export function buildNav(stats: Stats): NavSection[] {
	const visible = MODULES.filter((m) => !m.hidden);
	const byKey = new Map(visible.map((m) => [m.key, m]));

	const entryFor = (key: string): NavEntry | null => {
		const view = getView(key);
		if (view) {
			// A view is only worth a slot if something it reads is still around.
			if (!view.of.some((k) => byKey.has(k))) return null;
			return { code: view.code, label: view.label, href: view.href, count: null };
		}
		const mod = byKey.get(key);
		if (!mod) return null;
		return {
			code: MODULE_CODES[mod.key] ?? '',
			label: mod.label,
			href: `/${mod.key}`,
			count: stats[mod.key] ?? 0
		};
	};

	const claimed = new Set(
		NAV_CATEGORIES.flatMap((c) => [...c.members, ...(c.fronts ?? [])])
	);
	const orphans = visible.filter((m) => !claimed.has(m.key)).map((m) => m.key);

	const entries: NavEntry[] = NAV_CATEGORIES.map((c) => {
		const memberKeys = [...c.members, ...(c.key === FALLBACK_CATEGORY ? orphans : [])];
		const children = memberKeys.map(entryFor).filter((e): e is NavEntry => e !== null);
		// Rows this category fronts: its drill tables plus the modules its own
		// page embodies. Views contribute nothing — their rows are counted once,
		// by the table they read.
		const counted = new Set(
			[...memberKeys, ...(c.fronts ?? [])].filter((k) => byKey.has(k))
		);
		const count = [...counted].reduce((sum, k) => sum + (stats[k] ?? 0), 0);
		return { code: c.code, label: c.label, href: c.href, count, children };
	});

	return [
		{
			key: 'top',
			label: null,
			entries: [
				{ code: '~', label: 'Overview', href: '/', count: null },
				// The review queue. Its count is decisions waiting, not rows —
				// /stats carries it under a non-module key.
				{ code: 'AI', label: 'Assist', href: '/assist', count: stats['_assist_pending'] ?? null }
			]
		},
		{ key: 'pages', label: null, entries },
		{
			key: 'system',
			label: null,
			rule: true,
			entries: [{ code: 'SYS', label: 'Admin', href: '/admin', count: null }]
		}
	];
}

/**
 * Where a record opens. Most open on their own page, but two modules are
 * fronted by a richer view: a project opens in the tracker, and a performance
 * opens on the show page rather than as a bare event row. Anything that jumps
 * to a record — the overview's trail, the command palette — routes through
 * here so they can't drift apart.
 */
export function recordHref(module: string, id: number | string, kind?: string | null): string {
	if (module === 'projects') return `/projects?open=${id}`;
	if (module === 'events' && kind === 'performance') return `/shows/${id}`;
	return `/${module}/${id}`;
}

/**
 * Every place the rail can take you, flattened — what the command palette
 * offers under "Go to". Drill-down tables are included even though the rail
 * only shows them in context: ⌘K is the other half of the drill system.
 */
export function navTargets(): { code: string; label: string; href: string }[] {
	const out: { code: string; label: string; href: string }[] = [];
	for (const s of buildNav({}))
		for (const e of s.entries) {
			out.push({ code: e.code, label: e.label, href: e.href });
			for (const c of e.children ?? []) out.push({ code: c.code, label: c.label, href: c.href });
		}
	return out;
}
