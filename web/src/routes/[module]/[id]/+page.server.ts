import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getModule } from '$lib/modules';
import { api } from '$lib/server/api';
import { coerce } from '$lib/coerce';
import { loadRelationOptions, loadTagSuggestions } from '$lib/server/relations';
import type { Item } from '$lib/types';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';

export const load: PageServerLoad = async ({ params }) => {
	const mod = getModule(params.module);
	if (!mod) throw error(404, `Unknown module: ${params.module}`);
	let item: Item;
	try {
		item = await api.get(mod.key, params.id);
	} catch {
		throw error(404, `No ${mod.singular} #${params.id}`);
	}
	const [relationOptions, tagSuggestions, attendeeSuggestions] = await Promise.all([
		loadRelationOptions(mod),
		loadTagSuggestions(),
		// Attendees suggest People (with free-typed one-offs still allowed),
		// not the shared tag vocabulary.
		mod.key === 'notes'
			? api.list('people').then(
					(ppl) => ppl.map((p) => String(p.name ?? '')).filter(Boolean),
					() => []
				)
			: Promise.resolve(null)
	]);
	return { moduleKey: mod.key, item, relationOptions, tagSuggestions, attendeeSuggestions };
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const mod = getModule(params.module);
		if (!mod) throw error(404);
		try {
			await api.update(mod.key, params.id, coerce(mod.fields, await request.formData()));
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		return { ok: true };
	},
	delete: async ({ params }) => {
		const mod = getModule(params.module);
		if (!mod) throw error(404);
		try {
			await api.remove(mod.key, params.id);
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e) });
		}
		throw redirect(303, `/${mod.key}`);
	},

	// Open the record's on-disk folder in the OS file manager. The path is read
	// from the stored record (by id) — never taken from the client — and passed
	// to xdg-open as an argument (no shell), so it can't be used for injection.
	// Requires base to run on the same machine/desktop session as the files.
	open: async ({ params }) => {
		const mod = getModule(params.module);
		if (!mod) throw error(404);
		let item: Item;
		try {
			item = await api.get(mod.key, params.id);
		} catch {
			return fail(404, { message: 'Record not found.' });
		}
		// Prefer the first-class path column; fall back to the imported raw copy.
		const own = (item as { path?: unknown }).path;
		const raw = item.raw as { path?: unknown } | undefined;
		const target =
			typeof own === 'string' && own ? own : typeof raw?.path === 'string' ? raw.path : null;
		if (!target) return fail(400, { message: 'No file path recorded for this record.' });
		let toOpen: string;
		try {
			toOpen = statSync(target).isDirectory() ? target : dirname(target);
		} catch {
			return fail(404, { message: 'Path not found on disk — is the drive mounted?' });
		}
		try {
			const child = spawn('xdg-open', [toOpen], { detached: true, stdio: 'ignore' });
			child.on('error', () => {}); // don't crash the server if xdg-open is missing
			child.unref();
		} catch (e) {
			return fail(500, {
				message: `Could not launch file manager: ${e instanceof Error ? e.message : String(e)}`
			});
		}
		return { opened: true };
	}
};
