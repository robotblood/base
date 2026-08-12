import type { LayoutServerLoad } from './$types';
import { api } from '$lib/server/api';
import { ensureCustomModules, getModuleExtensions } from '$lib/server/customTables';
import { toCss, withDefaults, type DesignConfig } from '$lib/design/tokens';
import type { Stats } from '$lib/types';

// Load per-module counts for the sidebar and the saved design tokens. If the
// API is down, degrade to empty counts and the default theme rather than
// failing the whole app — the defaults reproduce base's built-in look, so an
// unreachable API costs you your counts, not your interface.
export const load: LayoutServerLoad = async () => {
	const [stats, design, customTables, serverModules] = await Promise.all([
		api.stats().catch((): Stats => ({})),
		api.getSetting('design').catch(() => null),
		ensureCustomModules(),
		// Served module config (Rust server). Null — FastAPI or a down API —
		// means the static modules.ts registry stands as-is.
		api.modules().catch(() => null)
	]);
	// Custom tables aren't in /stats; their registry rows carry the count.
	for (const t of customTables) stats[t.key] = t.row_count ?? 0;
	const config: DesignConfig = withDefaults(design);
	return {
		stats,
		themeCss: toCss(config),
		customTables,
		moduleFields: getModuleExtensions(),
		serverModules
	};
};
