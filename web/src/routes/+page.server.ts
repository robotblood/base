import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { DashboardData } from '$lib/types';

export const load: PageServerLoad = async () => {
	let dashboard: DashboardData | null = null;
	let apiError: string | null = null;
	try {
		dashboard = await api.dashboard();
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { dashboard, apiError };
};
