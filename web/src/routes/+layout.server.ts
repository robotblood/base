import type { LayoutServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Stats } from '$lib/types';

// Load per-module counts for the sidebar. If the API is down, degrade to empty
// counts rather than failing the whole app.
export const load: LayoutServerLoad = async () => {
	let stats: Stats = {};
	try {
		stats = await api.stats();
	} catch {
		stats = {};
	}
	return { stats };
};
