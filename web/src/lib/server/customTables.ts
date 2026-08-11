// Server-side registry refresh for custom tables and extension fields. Any
// load that resolves a module calls ensureCustomModules() first, so
// getModule() also finds tables built at runtime — and built-ins pick up
// their user-added fields. Definitions are cached briefly — every navigation
// hits this — and the admin/table actions bust the cache on mutation so a
// just-created table or field is browsable immediately.
import { api } from '$lib/server/api';
import { applyModuleExtensions, registerCustomModules, type CustomTableDef } from '$lib/modules';
import type { FieldSpec } from '$lib/types';

type ExtMap = Record<string, FieldSpec[]>;

let cache: { defs: CustomTableDef[]; ext: ExtMap; exp: number } = { defs: [], ext: {}, exp: 0 };

export async function ensureCustomModules(): Promise<CustomTableDef[]> {
	if (Date.now() >= cache.exp) {
		try {
			const [defs, ext] = await Promise.all([
				api.list('tables') as unknown as Promise<CustomTableDef[]>,
				api.moduleFields()
			]);
			cache = { defs, ext, exp: Date.now() + 10_000 };
		} catch {
			// API down: keep serving what we had — the layout degrades the same way.
		}
	}
	registerCustomModules(cache.defs);
	applyModuleExtensions(cache.ext);
	return cache.defs;
}

// The layout load threads this to the client so the browser-side registry
// can apply the same extensions during hydration.
export function getModuleExtensions(): ExtMap {
	return cache.ext;
}

export function bustCustomModulesCache(): void {
	cache.exp = 0;
}
