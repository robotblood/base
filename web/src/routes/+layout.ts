import type { LayoutLoad } from './$types';
import { applyModuleExtensions, applyServerModules, registerCustomModules } from '$lib/modules';

// Register user-built tables as modules on BOTH sides. The server load
// fetched the definitions; this universal load runs before any component
// reads MODULES — during SSR and again in the browser on hydration and every
// invalidation — so getModule() resolves custom tables everywhere. The same
// pass merges user-added fields into the built-in modules.
//
// Order matters: the served registry replaces the built-in configs first
// (it carries this instance's customizations), then custom tables register,
// then extension fields merge on top of whichever base config won.
export const load: LayoutLoad = async ({ data }) => {
	applyServerModules(data.serverModules);
	registerCustomModules(data.customTables ?? []);
	applyModuleExtensions(data.moduleFields ?? {});
	return data;
};
