import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';

// Mutation relay for the projects tracker — the browser only ever talks to
// the SvelteKit server, which forwards to FastAPI (same BFF pattern as loads).
export const POST: RequestHandler = async ({ request }) => {
	const { op, id, patch, data } = await request.json();
	if (op === 'update') return json(await api.update('projects', id, patch));
	if (op === 'task') return json(await api.update('todos', id, patch));
	if (op === 'create') return json(await api.create('projects', data));
	throw error(400, `unknown op: ${op}`);
};
