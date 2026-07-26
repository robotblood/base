// Server-only client for the FastAPI backend. Lives under /server/ so SvelteKit
// guarantees it is never bundled into the browser — the API URL and all calls
// stay on the SvelteKit server (the "no CORS" BFF pattern).
import { env } from '$env/dynamic/private';
import type { DashboardData, Item, Stats } from '$lib/types';

const BASE = env.API_BASE_URL ?? 'http://127.0.0.1:8000';

async function req(path: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`API ${res.status} ${res.statusText} — ${path}${body ? `: ${body}` : ''}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

export const api = {
	list: (endpoint: string, q?: string) =>
		req(`/${endpoint}${q ? `?q=${encodeURIComponent(q)}` : ''}`) as Promise<Item[]>,
	get: (endpoint: string, id: number | string) => req(`/${endpoint}/${id}`) as Promise<Item>,
	create: (endpoint: string, data: unknown) =>
		req(`/${endpoint}`, { method: 'POST', body: JSON.stringify(data) }) as Promise<Item>,
	update: (endpoint: string, id: number | string, data: unknown) =>
		req(`/${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }) as Promise<Item>,
	remove: (endpoint: string, id: number | string) =>
		req(`/${endpoint}/${id}`, { method: 'DELETE' }) as Promise<null>,
	tags: (module?: string) =>
		req(`/tags${module ? `?module=${encodeURIComponent(module)}` : ''}`) as Promise<string[]>,
	stats: () => req('/stats') as Promise<Stats>,
	dashboard: () => req('/dashboard') as Promise<DashboardData>,
	getSetting: (key: string) => req(`/settings/${key}`) as Promise<unknown>,
	putSetting: (key: string, value: unknown) =>
		req(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }) as Promise<unknown>,
	deleteSetting: (key: string) => req(`/settings/${key}`, { method: 'DELETE' }) as Promise<null>
};
