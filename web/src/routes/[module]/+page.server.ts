import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getModule } from '$lib/modules';
import { api } from '$lib/server/api';
import { coerce } from '$lib/coerce';
import { loadRelationOptions, loadTagSuggestions, withRelationLabels } from '$lib/server/relations';
import type { Item } from '$lib/types';

export const load: PageServerLoad = async ({ params, url }) => {
	const mod = getModule(params.module);
	if (!mod) throw error(404, `Unknown module: ${params.module}`);

	const q = url.searchParams.get('q') ?? '';
	let items: Item[] = [];
	let apiError: string | null = null;
	const [relationOptions, tagSuggestions] = await Promise.all([
		loadRelationOptions(mod),
		loadTagSuggestions()
	]);
	try {
		items = withRelationLabels(await api.list(mod.key, q || undefined), mod, relationOptions);
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { moduleKey: mod.key, q, items, apiError, relationOptions, tagSuggestions };
};

function fieldsFor(module: string) {
	const mod = getModule(module);
	if (!mod) throw error(404, `Unknown module: ${module}`);
	return mod;
}

export const actions: Actions = {
	create: async ({ params, request }) => {
		const mod = fieldsFor(params.module);
		const data = coerce(mod.fields, await request.formData());
		if (!data[mod.titleField]) return fail(422, { message: `${mod.titleField} is required` });
		try {
			await api.create(mod.key, data);
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	},

	// Set a single field on one record — used by the board's drag-to-move.
	// The field name is checked against the module's own specs, so a crafted
	// request can't PATCH a column the module doesn't expose for editing.
	setField: async ({ params, request }) => {
		const mod = fieldsFor(params.module);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const field = String(form.get('field') ?? '');
		const raw = form.get('value');

		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'Bad record id' });
		const spec = mod.fields.find((f) => f.name === field);
		if (!spec) return fail(400, { message: `Unknown field: ${field}` });

		const value = raw == null || String(raw) === '' ? null : String(raw);
		try {
			await api.update(mod.key, id, { [field]: value });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	}
};
