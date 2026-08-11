import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { MODULES } from '$lib/modules';
import type { ArchivedTable, OrphanField, TrashEntry } from '$lib/admin';
import { api } from '$lib/server/api';
import { bustCustomModulesCache, ensureCustomModules } from '$lib/server/customTables';

// Everything recoverable, in one place: tables serialized at deletion,
// deleted records waiting out their retention window in the trash, and
// removed fields whose values still sit in rows.
export const load: PageServerLoad = async () => {
	await ensureCustomModules(); // registers custom tables so labels resolve
	const [archives, trash, orphans] = await Promise.all([
		api.archives() as Promise<ArchivedTable[]>,
		api.trash() as Promise<TrashEntry[]>,
		api.orphanFields() as Promise<OrphanField[]>
	]);
	// Friendly module names for trash rows. A row whose table has since been
	// archived resolves to nothing — the raw key is the honest label then.
	const labels = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));
	return { archives, trash, orphans, labels };
};

const id = (form: FormData, field = 'id'): number | null => {
	const n = Number(form.get(field));
	return Number.isInteger(n) && n > 0 ? n : null;
};

const run = async (work: () => Promise<unknown>) => {
	try {
		await work();
	} catch (e) {
		return fail(502, { message: e instanceof Error ? e.message : String(e) });
	}
	return { ok: true };
};

export const actions: Actions = {
	restoreArchive: async ({ request }) => {
		const archiveId = id(await request.formData());
		if (!archiveId) return fail(400, { message: 'Bad archive id' });
		const result = await run(() => api.restoreArchive(archiveId));
		bustCustomModulesCache(); // the restored table goes straight back in the sidebar
		return result;
	},
	purgeArchive: async ({ request }) => {
		const archiveId = id(await request.formData());
		if (!archiveId) return fail(400, { message: 'Bad archive id' });
		return run(() => api.purgeArchive(archiveId));
	},
	restoreRecord: async ({ request }) => {
		const revisionId = id(await request.formData(), 'revision_id');
		if (!revisionId) return fail(400, { message: 'Bad revision id' });
		return run(() => api.restoreTrash(revisionId));
	},
	purgeRecord: async ({ request }) => {
		const revisionId = id(await request.formData(), 'revision_id');
		if (!revisionId) return fail(400, { message: 'Bad revision id' });
		return run(() => api.purgeTrash(revisionId));
	},
	emptyTrash: async () => run(() => api.emptyTrash()),
	restoreField: async ({ request }) => {
		const form = await request.formData();
		const module = form.get('module')?.toString() ?? '';
		const key = form.get('key')?.toString() ?? '';
		if (!module || !key) return fail(400, { message: 'Bad field target' });
		const result = await run(() => api.restoreOrphanField(module, key));
		bustCustomModulesCache(); // the field list changed — views pick it up now
		return result;
	},
	purgeField: async ({ request }) => {
		const form = await request.formData();
		const module = form.get('module')?.toString() ?? '';
		const key = form.get('key')?.toString() ?? '';
		if (!module || !key) return fail(400, { message: 'Bad field target' });
		return run(() => api.purgeOrphanField(module, key));
	}
};
