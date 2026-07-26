import { json, error } from '@sveltejs/kit';
import { api } from '$lib/server/api';
import { withDefaults } from '$lib/design/tokens';
import type { RequestHandler } from './$types';

// Saving is a plain endpoint rather than a form action because the design page
// autosaves as you drag a slider — a debounced fetch is the right shape for
// that, and a form action would push a navigation each time.

export const PUT: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'invalid JSON');
	}
	// Normalise before storing so a half-populated payload can never write a
	// palette with holes in it — a missing token would render as `undefined`
	// in the stylesheet and blank that part of the interface.
	const config = withDefaults(body);
	await api.putSetting('design', config);
	return json(config);
};

/** Drop the saved tokens; the app falls back to its built-in look. */
export const DELETE: RequestHandler = async () => {
	await api.deleteSetting('design');
	return new Response(null, { status: 204 });
};
