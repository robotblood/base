import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { normalizeTemplates, type MdTemplate } from '$lib/templates';

// Templates live whole in one settings blob (key "templates"), like the
// design tokens — they're system furniture, not content, so no table. Every
// action rewrites the full list; at this scale (a handful of templates,
// single user) read-modify-write is plenty.
const KEY = 'templates';

async function readAll(): Promise<MdTemplate[]> {
	return normalizeTemplates(await api.getSetting(KEY).catch(() => null));
}

export const load: PageServerLoad = async () => ({ templates: await readAll() });

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const id = form.get('id')?.toString() ?? '';
		const name = form.get('name')?.toString().trim();
		const body = form.get('body')?.toString() ?? '';
		if (!name) return fail(422, { message: 'Give the template a name — it’s what the “/” menu shows.' });
		if (!body.trim()) return fail(422, { message: 'An empty template inserts nothing — write the body first.' });
		const all = await readAll();
		const existing = id ? all.find((t) => t.id === id) : undefined;
		if (existing) {
			existing.name = name;
			existing.body = body;
		} else {
			all.push({ id: randomUUID(), name, body });
		}
		try {
			await api.putSetting(KEY, { templates: all });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	},

	remove: async ({ request }) => {
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { message: 'Bad template id' });
		const all = await readAll();
		try {
			await api.putSetting(KEY, { templates: all.filter((t) => t.id !== id) });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	}
};
