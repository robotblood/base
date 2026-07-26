// Mutation relay for the Show Details dashboard — same BFF pattern as
// /projects/sync: the browser only ever talks to the SvelteKit server.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const patch = await request.json();
	return json(await api.update('events', params.id, patch));
};
