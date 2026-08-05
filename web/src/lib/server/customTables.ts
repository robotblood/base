// Server-side registry refresh for custom tables. Any load that resolves a
// module calls ensureCustomModules() first, so getModule() also finds tables
// built at runtime. Definitions are cached briefly — every navigation hits
// this — and the admin actions bust the cache on mutation so a just-created
// table is browsable immediately.
import { api } from '$lib/server/api';
import { registerCustomModules, type CustomTableDef } from '$lib/modules';

let cache: { defs: CustomTableDef[]; exp: number } = { defs: [], exp: 0 };

export async function ensureCustomModules(): Promise<CustomTableDef[]> {
	if (Date.now() >= cache.exp) {
		try {
			const defs = (await api.list('tables')) as unknown as CustomTableDef[];
			cache = { defs, exp: Date.now() + 10_000 };
		} catch {
			// API down: keep serving what we had — the layout degrades the same way.
		}
	}
	registerCustomModules(cache.defs);
	return cache.defs;
}

export function bustCustomModulesCache(): void {
	cache.exp = 0;
}
