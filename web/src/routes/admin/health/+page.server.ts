import { env } from '$env/dynamic/private';
import { hostHealth } from '$lib/server/host';
import type { ApiHealth, PathHealth } from '$lib/admin';
import type { Actions, PageServerLoad } from './$types';

const API = env.API_BASE_URL ?? 'http://127.0.0.1:8000';

// The API's own health goes through plain fetch rather than $lib/server/api:
// that client throws on a non-200, and "the API is unreachable" is the answer
// this page most needs to render, not an error that blanks it.
async function apiHealth<T>(path: string, timeoutMs = 4000): Promise<T | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${API}${path}`, { signal: ctrl.signal });
		return res.ok ? ((await res.json()) as T) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export const load: PageServerLoad = async () => {
	const [host, api] = await Promise.all([hostHealth(), apiHealth<ApiHealth>('/health')]);
	return { host, api, apiBase: API };
};

export const actions: Actions = {
	// Filesystem checks are slow enough (and change rarely enough) that they run
	// on request instead of with every page load.
	paths: async () => {
		const paths = await apiHealth<PathHealth>('/health/paths', 20000);
		return { paths };
	}
};
