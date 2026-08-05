import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { MODULES } from '$lib/modules';
import { api } from '$lib/server/api';
import { bustCustomModulesCache, ensureCustomModules } from '$lib/server/customTables';
import type { FieldSpec, Item } from '$lib/types';

// Imported data that has a table but no place in the sidebar yet. The
// `collections` module holds several Notion databases at once (each row names
// which one it came from), so this breaks it back apart — the useful unit here
// is the source database, not the table.
export const load: PageServerLoad = async () => {
	const tables = await ensureCustomModules();
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
	// Relations from custom tables may point at any visible built-in module.
	const refTargets = MODULES.filter((m) => !m.hidden && !m.custom).map((m) => ({
		key: m.key,
		label: m.label
	}));
	return { groups, tables, refTargets };
};

// The field editor serializes its rows into one JSON form value; parse and
// sanity-check here, let the API do the authoritative validation.
function parseFields(raw: FormDataEntryValue | null): FieldSpec[] | null {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		const fields = JSON.parse(raw);
		return Array.isArray(fields) ? (fields as FieldSpec[]) : null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	createTable: async ({ request }) => {
		const form = await request.formData();
		const name = form.get('name')?.toString().trim();
		const key = form.get('key')?.toString().trim();
		const fields = parseFields(form.get('fields'));
		if (!name || !key) return fail(422, { message: 'Name and key are required' });
		if (!fields?.length) return fail(422, { message: 'Add at least one field' });
		try {
			await api.create('tables', { name, key, fields });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		bustCustomModulesCache();
		return { ok: true };
	},
	updateTable: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = form.get('name')?.toString().trim();
		const fields = parseFields(form.get('fields'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'Bad table id' });
		if (!fields?.length) return fail(422, { message: 'Add at least one field' });
		try {
			await api.update('tables', id, { ...(name ? { name } : {}), fields });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		bustCustomModulesCache();
		return { ok: true };
	},
	deleteTable: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'Bad table id' });
		try {
			await api.remove('tables', id);
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		bustCustomModulesCache();
		return { ok: true };
	}
};
