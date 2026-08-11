import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Item } from '$lib/types';

// The Assist review queue: everything machines have proposed, waiting on (or
// carrying) a human verdict. The page never mutates records itself — every
// button here resolves a suggestion, and only Accept touches another table,
// server-side, through the apply handlers in app/assist.py.

export interface SuggestionRow {
	id: number;
	source: string;
	kind: string;
	title: string;
	edited_title: string | null;
	why: string;
	writes: string;
	status: string;
	status_at: string | null;
	snooze_until: string | null;
	created_at: string;
	action: { op: string } & Record<string, unknown>;
}

export interface PassRow {
	id: number;
	at: string;
	source: string;
	scanned: Record<string, number>;
	created: number;
	suppressed: number;
	note: string | null;
}

export const load: PageServerLoad = async () => {
	let error: string | null = null;
	let suggestions: Item[] = [];
	let passes: Item[] = [];
	let status = { pending: 0, db_guard: false, last_pass: {} as Record<string, string> };
	try {
		[suggestions, passes, status] = await Promise.all([
			api.assistSuggestions(),
			api.assistPasses(),
			api.assistStatus()
		]);
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}
	return {
		error,
		suggestions: suggestions as unknown as SuggestionRow[],
		passes: passes as unknown as PassRow[],
		assist: status
	};
};

const idOf = (form: FormData): number => Number(form.get('id'));

export const actions: Actions = {
	accept: async ({ request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		try {
			await api.assistVerb(idOf(form), 'accept', title ? { title } : {});
		} catch (e) {
			return fail(409, { message: e instanceof Error ? e.message : String(e) });
		}
	},
	dismiss: async ({ request }) => {
		await api.assistVerb(idOf(await request.formData()), 'dismiss');
	},
	snooze: async ({ request }) => {
		await api.assistVerb(idOf(await request.formData()), 'snooze');
	},
	// Saves a reworded title without deciding — the row stays pending and the
	// original proposal is kept server-side for the eval record.
	edit: async ({ request }) => {
		const form = await request.formData();
		await api.assistEdit(idOf(form), String(form.get('title') ?? ''));
	},
	run: async () => {
		await api.assistRun();
	}
};
