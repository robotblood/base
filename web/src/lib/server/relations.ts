// Server-side helpers that feed the config-driven form: the pickable options
// for each `relation` field, and the existing tags for the tag picker. Both are
// derived generically from a module's field specs, so linking a new pair of
// tables needs no code here — just a `relation` field in modules.ts.
import { api } from '$lib/server/api';
import { getModule } from '$lib/modules';
import type { Item, ModuleConfig, RelationOption } from '$lib/types';

// For every distinct module referenced by a relation field, fetch its records
// as {id, label} options. Failures degrade to an empty list, never a 500.
export async function loadRelationOptions(
	mod: ModuleConfig
): Promise<Record<string, RelationOption[]>> {
	const refs = [
		...new Set(
			mod.fields.filter((f) => f.type === 'relation' && f.ref).map((f) => f.ref as string)
		)
	];
	const out: Record<string, RelationOption[]> = {};
	await Promise.all(
		refs.map(async (key) => {
			const refMod = getModule(key);
			if (!refMod) return;
			try {
				const items = await api.list(key);
				out[key] = items
					.map((it) => ({ id: Number(it.id), label: String(it[refMod.titleField] ?? `#${it.id}`) }))
					.sort((a, b) => a.label.localeCompare(b.label));
			} catch {
				out[key] = [];
			}
		})
	);
	return out;
}

// Existing tags across all modules (shared vocabulary), for the picker's
// suggestions. Empty on failure so the form still works.
export async function loadTagSuggestions(): Promise<string[]> {
	try {
		return (await api.tags()) ?? [];
	} catch {
		return [];
	}
}

// Attach a human-readable `<field>_label` to each item for every relation field,
// so list tables can show "Project: Amber Event" instead of a bare id.
export function withRelationLabels(
	items: Item[],
	mod: ModuleConfig,
	relationOptions: Record<string, RelationOption[]>
): Item[] {
	const relFields = mod.fields.filter((f) => f.type === 'relation' && f.ref);
	if (!relFields.length) return items;
	const label: Record<string, Map<number, string>> = {};
	for (const f of relFields) {
		label[f.name] = new Map((relationOptions[f.ref as string] ?? []).map((o) => [o.id, o.label]));
	}
	return items.map((it) => {
		const extra: Record<string, unknown> = {};
		for (const f of relFields) {
			const id = it[f.name];
			extra[`${f.name}_label`] = id != null ? (label[f.name].get(Number(id)) ?? '') : '';
		}
		return { ...it, ...extra };
	});
}
