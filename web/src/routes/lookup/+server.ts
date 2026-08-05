import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';
import { getModule, MODULES } from '$lib/modules';

// Record search for the note-button target picker. The API client is
// server-only (see lib/server/api.ts), so the browser reaches it through here.
//
// GET /lookup                    → { modules: [{ key, label }] }
// GET /lookup?module=notes&q=fee → { results: [{ id, label, href }] }
export const GET: RequestHandler = async ({ url }) => {
	const key = url.searchParams.get('module');
	if (!key) {
		return json({ modules: MODULES.map((m) => ({ key: m.key, label: m.label })) });
	}

	const mod = getModule(key);
	if (!mod) return json({ results: [] });

	const q = url.searchParams.get('q')?.trim() ?? '';
	let rows;
	try {
		rows = await api.list(mod.key, q || undefined);
	} catch {
		// A backend hiccup shouldn't break the dialog — the target field still
		// accepts a typed path.
		return json({ results: [] });
	}

	const results = rows.slice(0, 20).map((row) => ({
		id: row.id,
		label: String(row[mod.titleField] ?? `${mod.singular} ${row.id}`),
		href: `/${mod.key}/${row.id}`
	}));
	return json({ results });
};
