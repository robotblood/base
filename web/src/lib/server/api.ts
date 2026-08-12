// Server-only client for the FastAPI backend. Lives under /server/ so SvelteKit
// guarantees it is never bundled into the browser — the API URL and all calls
// stay on the SvelteKit server (the "no CORS" BFF pattern).
import { env } from '$env/dynamic/private';
import type { DashboardData, FieldSpec, Item, ModuleConfig, Stats } from '$lib/types';

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
	// The served module registry: built-in view config with the instance's
	// overrides merged in (Rust server only — FastAPI 404s, and the layout
	// degrades to the static modules.ts config).
	modules: () =>
		req('/modules') as Promise<{ modules: ModuleConfig[]; codes: Record<string, string> }>,
	dashboard: () => req('/dashboard') as Promise<DashboardData>,
	// Extension fields on built-in modules — see app/fields.py.
	moduleFields: () => req('/fields') as Promise<Record<string, FieldSpec[]>>,
	putModuleFields: (module: string, fields: FieldSpec[]) =>
		req(`/fields/${module}`, { method: 'PUT', body: JSON.stringify(fields) }) as Promise<
			FieldSpec[]
		>,
	// Archived tables and the row trash — see app/custom.py and app/trash.py.
	archives: () => req('/archives') as Promise<unknown[]>,
	restoreArchive: (id: number) => req(`/archives/${id}/restore`, { method: 'POST' }),
	purgeArchive: (id: number) => req(`/archives/${id}`, { method: 'DELETE' }) as Promise<null>,
	trash: () => req('/trash') as Promise<unknown[]>,
	restoreTrash: (revisionId: number) => req(`/trash/${revisionId}/restore`, { method: 'POST' }),
	purgeTrash: (revisionId: number) => req(`/trash/${revisionId}`, { method: 'DELETE' }) as Promise<null>,
	emptyTrash: () => req('/trash', { method: 'DELETE' }) as Promise<null>,
	// Leftover values of removed fields — see app/fields.py.
	orphanFields: () => req('/fields/orphans') as Promise<unknown[]>,
	restoreOrphanField: (module: string, key: string) =>
		req('/fields/orphans/restore', { method: 'POST', body: JSON.stringify({ module, key }) }),
	purgeOrphanField: (module: string, key: string) =>
		req('/fields/orphans/purge', { method: 'POST', body: JSON.stringify({ module, key }) }),
	// The assist queue — see app/assist.py. Verbs are POSTs because each one
	// is a decision with side effects, not a field edit.
	assistSuggestions: (status?: string) =>
		req(`/assist/suggestions${status ? `?status=${status}` : ''}`) as Promise<Item[]>,
	assistVerb: (id: number, verb: 'accept' | 'dismiss' | 'snooze', body?: unknown) =>
		req(`/assist/suggestions/${id}/${verb}`, {
			method: 'POST',
			body: JSON.stringify(body ?? {})
		}) as Promise<Item>,
	assistEdit: (id: number, title: string) =>
		req(`/assist/suggestions/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ title })
		}) as Promise<Item>,
	assistRun: () => req('/assist/run', { method: 'POST' }) as Promise<Item>,
	assistPasses: () => req('/assist/passes') as Promise<Item[]>,
	assistStatus: () =>
		req('/assist/status') as Promise<{
			pending: number;
			db_guard: boolean;
			last_pass: Record<string, string>;
		}>,
	getSetting: (key: string) => req(`/settings/${key}`) as Promise<unknown>,
	putSetting: (key: string, value: unknown) =>
		req(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }) as Promise<unknown>,
	deleteSetting: (key: string) => req(`/settings/${key}`, { method: 'DELETE' }) as Promise<null>
};
