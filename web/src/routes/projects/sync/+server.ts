import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';

// Mutation relay for the projects tracker — the browser only ever talks to
// the SvelteKit server, which forwards to FastAPI (same BFF pattern as loads).
export const POST: RequestHandler = async ({ request }) => {
	const { op, id, patch, data } = await request.json();
	if (op === 'update') return json(await api.update('projects', id, patch));
	if (op === 'task') return json(await api.update('todos', id, patch));
	if (op === 'task-create') return json(await api.create('todos', data));
	if (op === 'task-delete') {
		await api.remove('todos', id);
		return json({ ok: true });
	}
	if (op === 'note-create') return json(await api.create('notes', data));
	if (op === 'note-delete') {
		await api.remove('notes', id);
		return json({ ok: true });
	}
	if (op === 'create') return json(await api.create('projects', data));
	throw error(400, `unknown op: ${op}`);
};
