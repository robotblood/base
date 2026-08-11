import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { MODULES, MODULE_CODES } from '$lib/modules';
import { NAV_CATEGORIES } from '$lib/nav';
import { ensureCustomModules } from '$lib/server/customTables';
import type { Item, Stats } from '$lib/types';

// Every table in the system, on one page — the index the drill-down system
// hangs off. Built-ins grouped by the category that fronts them, then the
// library shelves, then user-built tables, then the imported databases that
// aren't modelled yet (which used to be this listing's home, in Admin → Data;
// the builder still lives there).

export interface TableRow {
	key: string;
	code: string;
	label: string;
	href: string;
	count: number;
	views: string[];
	fields: number;
}

export interface TableGroup {
	key: string;
	label: string;
	blurb: string;
	rows: TableRow[];
}

export const load: PageServerLoad = async () => {
	let error: string | null = null;
	let stats: Stats = {};
	try {
		await ensureCustomModules();
		stats = await api.stats();
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}

	const row = (key: string): TableRow | null => {
		const m = MODULES.find((x) => x.key === key);
		if (!m) return null;
		return {
			key: m.key,
			code: MODULE_CODES[m.key] ?? '',
			label: m.label,
			href: `/${m.key}`,
			count: stats[m.key] ?? 0,
			views: m.views ?? ['table'],
			fields: m.fields.length
		};
	};

	// Built-ins in category order; whatever no category claims is the library.
	const claimed = new Set(NAV_CATEGORIES.flatMap((c) => [...c.members, ...(c.fronts ?? [])]));
	const groups: TableGroup[] = [];
	for (const c of NAV_CATEGORIES) {
		const keys = [...(c.fronts ?? []), ...c.members].filter(
			(k, i, a) => a.indexOf(k) === i && MODULES.some((m) => m.key === k && !m.custom)
		);
		const rows = keys.map(row).filter((r): r is TableRow => r !== null);
		if (rows.length)
			groups.push({ key: c.key, label: c.label, blurb: `drills under ${c.label}`, rows });
	}
	const library = MODULES.filter((m) => !m.hidden && !m.custom && !claimed.has(m.key))
		.map((m) => row(m.key))
		.filter((r): r is TableRow => r !== null);
	if (library.length)
		groups.push({ key: 'library', label: 'Library', blurb: 'reference shelves', rows: library });

	const custom = MODULES.filter((m) => m.custom)
		.map((m) => row(m.key))
		.filter((r): r is TableRow => r !== null);
	if (custom.length)
		groups.push({ key: 'custom', label: 'Custom', blurb: 'built in the table builder', rows: custom });

	// Imported Notion databases still parked in `collections` — one row per
	// source database, same breakdown Admin → Data shows next to the builder.
	let imported: { name: string; count: number }[] = [];
	const hidden = MODULES.find((m) => m.key === 'collections');
	if (hidden && !error) {
		try {
			const rows: Item[] = await api.list('collections');
			const counts = new Map<string, number>();
			for (const r of rows) {
				const name = String(r.collection ?? hidden.label);
				counts.set(name, (counts.get(name) ?? 0) + 1);
			}
			imported = [...counts.entries()]
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
		} catch {
			// the listing stands without the imported breakdown
		}
	}

	return { error, groups, imported };
};
