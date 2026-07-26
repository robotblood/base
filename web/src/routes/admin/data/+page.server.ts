import type { PageServerLoad } from './$types';
import { MODULES } from '$lib/modules';
import { api } from '$lib/server/api';
import type { Item } from '$lib/types';

// Imported data that has a table but no place in the sidebar yet. The
// `collections` module holds several Notion databases at once (each row names
// which one it came from), so this breaks it back apart — the useful unit here
// is the source database, not the table.
export const load: PageServerLoad = async () => {
	const hidden = MODULES.filter((m) => m.hidden);
	const groups = await Promise.all(
		hidden.map(async (m) => {
			let rows: Item[] = [];
			let error: string | null = null;
			try {
				rows = await api.list(m.key);
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
			// Group by `collection` when the module has one, else the whole module
			// is a single group.
			const counts = new Map<string, number>();
			for (const r of rows) {
				const name = String(r.collection ?? m.label);
				counts.set(name, (counts.get(name) ?? 0) + 1);
			}
			return {
				key: m.key,
				label: m.label,
				total: rows.length,
				error,
				sets: [...counts.entries()]
					.map(([name, count]) => ({ name, count }))
					.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
			};
		})
	);
	return { groups };
};
