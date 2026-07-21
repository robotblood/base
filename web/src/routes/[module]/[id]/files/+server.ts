import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordRoot, listMedia } from '$lib/server/files';

// Lists previewable media (images/video/audio) in the record's folder.
export const GET: RequestHandler = async ({ params }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) return json({ items: [], capped: false });
	try {
		return json(listMedia(root));
	} catch {
		return json({ items: [], capped: false });
	}
};
