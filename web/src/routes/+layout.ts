import type { LayoutLoad } from './$types';
import { applyModuleExtensions, registerCustomModules } from '$lib/modules';

// Register user-built tables as modules on BOTH sides. The server load
// fetched the definitions; this universal load runs before any component
// reads MODULES — during SSR and again in the browser on hydration and every
// invalidation — so getModule() resolves custom tables everywhere. The same
// pass merges user-added fields into the built-in modules.
export const load: LayoutLoad = async ({ data }) => {
	registerCustomModules(data.customTables ?? []);
	applyModuleExtensions(data.moduleFields ?? {});
	return data;
};
