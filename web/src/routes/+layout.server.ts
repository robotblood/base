import type { LayoutServerLoad } from './$types';
import { api } from '$lib/server/api';
import { toCss, withDefaults, type DesignConfig } from '$lib/design/tokens';
import type { Stats } from '$lib/types';

// Load per-module counts for the sidebar and the saved design tokens. If the
// API is down, degrade to empty counts and the default theme rather than
// failing the whole app — the defaults reproduce base's built-in look, so an
// unreachable API costs you your counts, not your interface.
export const load: LayoutServerLoad = async () => {
	const [stats, design] = await Promise.all([
		api.stats().catch((): Stats => ({})),
		api.getSetting('design').catch(() => null)
	]);
	const config: DesignConfig = withDefaults(design);
	return { stats, themeCss: toCss(config) };
};
