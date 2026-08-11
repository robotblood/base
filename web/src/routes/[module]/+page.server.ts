import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiKey, getModule } from '$lib/modules';
import { api } from '$lib/server/api';
import { bustCustomModulesCache, ensureCustomModules } from '$lib/server/customTables';
import { coerce } from '$lib/coerce';
import { loadRelationOptions, loadTagSuggestions, withRelationLabels } from '$lib/server/relations';
import type { FieldSpec, FieldType, Item } from '$lib/types';

export const load: PageServerLoad = async ({ params, url }) => {
	await ensureCustomModules();
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
		items = withRelationLabels(await api.list(apiKey(mod), q || undefined), mod, relationOptions);
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { moduleKey: mod.key, q, items, apiError, relationOptions, tagSuggestions };
};

async function fieldsFor(module: string) {
	await ensureCustomModules();
	const mod = getModule(module);
	if (!mod) throw error(404, `Unknown module: ${module}`);
	return mod;
}

// ---- inline schema edits ---------------------------------------------------
// The table view's "+" column and per-header field editor post here, so the
// schema can grow without a trip to Admin → Data. On a custom table the whole
// field list (minus the pinned title) is editable; on a built-in module only
// the fields the user added (spec.ext, stored in the /fields registry) are —
// code-defined columns stay in code.

const FIELD_TYPES = new Set<FieldType>([
	'text',
	'textarea',
	'number',
	'date',
	'datetime',
	'select',
	'checkbox',
	'tags',
	'relation'
]);
// Leading letter required: the /fields registry rejects names that don't
// start with one, so "2026 Goals" must slug to "goals", not "2026_goals".
const slugName = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^[^a-z]+|_+$/g, '')
		.slice(0, 40);

async function customDef(module: string) {
	const defs = await ensureCustomModules();
	return defs.find((d) => d.key === module) ?? null;
}

// Where a module's user-defined fields are stored, and how to write them back.
async function fieldStore(mod: Awaited<ReturnType<typeof fieldsFor>>) {
	if (!mod.custom)
		return {
			pool: mod.fields.filter((f) => f.ext),
			save: (fields: FieldSpec[]) => api.putModuleFields(mod.key, fields)
		};
	const def = await customDef(mod.key);
	if (!def) return null;
	return {
		pool: def.fields,
		save: (fields: FieldSpec[]) => api.update('tables', def.id, { fields })
	};
}

export const actions: Actions = {
	create: async ({ params, request }) => {
		const mod = await fieldsFor(params.module);
		const data = coerce(mod.fields, await request.formData());
		if (!data[mod.titleField]) return fail(422, { message: `${mod.titleField} is required` });
		try {
			await api.create(apiKey(mod), data);
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	},

	// Title → straight into the record's document, ready to write. Only for
	// modules with a docField (notes).
	quick: async ({ params, request }) => {
		const mod = await fieldsFor(params.module);
		if (!mod.docField) return fail(400, { message: 'No quick create for this module' });
		const title = (await request.formData()).get('title')?.toString().trim();
		if (!title) return fail(422, { message: 'Title is required' });
		let id: unknown;
		try {
			({ id } = await api.create(apiKey(mod), { [mod.titleField]: title }));
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		redirect(303, `/${mod.key}/${id}?edit=1`);
	},

	// Set a single field on one record — used by the board's drag-to-move.
	// The field name is checked against the module's own specs, so a crafted
	// request can't PATCH a column the module doesn't expose for editing.
	setField: async ({ params, request }) => {
		const mod = await fieldsFor(params.module);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const field = String(form.get('field') ?? '');
		const raw = form.get('value');

		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'Bad record id' });
		const spec = mod.fields.find((f) => f.name === field);
		if (!spec) return fail(400, { message: `Unknown field: ${field}` });

		const value = raw == null || String(raw) === '' ? null : String(raw);
		try {
			await api.update(apiKey(mod), id, { [field]: value });
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	},

	// Add a field (empty `name`) or edit one (existing `name`). Type is fixed
	// once created — the stored values are already that shape — so on edit the
	// submitted type is ignored in favor of the field's own.
	saveField: async ({ params, request }) => {
		const mod = await fieldsFor(params.module);
		const store = await fieldStore(mod);
		if (!store) return fail(400, { message: 'Unknown table' });
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		const label = form.get('label')?.toString().trim() ?? '';
		if (!label) return fail(422, { message: 'Label is required' });
		if (name === mod.titleField) return fail(400, { message: 'The title field is pinned' });
		const existing = name ? store.pool.find((f) => f.name === name) : undefined;
		if (name && !existing) return fail(400, { message: `Not an editable field: ${name}` });
		const type = existing?.type ?? (form.get('type')?.toString() as FieldType);
		if (!FIELD_TYPES.has(type)) return fail(422, { message: 'Bad field type' });

		const spec: FieldSpec = {
			name,
			label,
			type,
			...(type === 'select'
				? {
						options: (form.get('options')?.toString() ?? '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean)
					}
				: {}),
			...(type === 'relation' && form.get('ref') ? { ref: String(form.get('ref')) } : {}),
			...(form.get('required') ? { required: true } : {})
		};

		let fields: FieldSpec[];
		if (existing) {
			fields = store.pool.map((f) => (f.name === name ? spec : f));
		} else {
			// Slug the label into a fresh data key; suffix rather than collide.
			// Everything the module already answers to is taken, plus the base
			// row columns the API owns.
			const taken = new Set([
				...mod.fields.map((f) => f.name),
				...mod.columns.map((c) => c.field),
				'id',
				'tags',
				'created_at',
				'updated_at',
				'notion_id',
				'source',
				'source_created_at',
				'raw',
				'extras'
			]);
			const base = slugName(label) || 'field';
			let candidate = base;
			for (let i = 2; taken.has(candidate); i++) candidate = `${base}_${i}`;
			spec.name = candidate;
			fields = [...store.pool, spec];
		}
		try {
			// The ext marker is a web-side merge artifact — never stored.
			await store.save(fields.map(({ ext: _ext, ...f }) => f));
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		bustCustomModulesCache();
		return { ok: true };
	},

	// Drop a field from the schema. Row data keeps the values, unshown — same
	// contract as removing a row in the admin builder.
	removeField: async ({ params, request }) => {
		const mod = await fieldsFor(params.module);
		const store = await fieldStore(mod);
		if (!store) return fail(400, { message: 'Unknown table' });
		const name = (await request.formData()).get('name')?.toString() ?? '';
		if (!name || name === mod.titleField)
			return fail(400, { message: 'That field cannot be removed' });
		if (!store.pool.some((f) => f.name === name))
			return fail(400, { message: `Not an editable field: ${name}` });
		try {
			await store.save(
				store.pool.filter((f) => f.name !== name).map(({ ext: _ext, ...f }) => f)
			);
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		bustCustomModulesCache();
		return { ok: true };
	}
};
