import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { kindOf, mimeOf, recordRoot, safeJoin } from '$lib/server/files';
import { thumbnail } from '$lib/server/thumbs';

// A resized webp thumbnail for an image — or a poster frame for a video — in
// the record's folder, served from the on-disk cache after first render.
// Falls back to the original for images sharp can't decode; 404s for videos
// when no poster can be made (no ffmpeg), so clients can show a placeholder.
export const GET: RequestHandler = async ({ params, url }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404);
	const full = safeJoin(root, url.searchParams.get('p') ?? '');
	if (!full) throw error(403);
	let ok = false;
	try {
		ok = statSync(full).isFile();
	} catch {
		ok = false;
	}
	if (!ok) throw error(404);

	const w = Math.min(800, Math.max(80, Number(url.searchParams.get('w') ?? 400)));
	const buf = await thumbnail(full, w);
	if (buf) {
		return new Response(new Uint8Array(buf), {
			headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' }
		});
	}
	if (kindOf(full) === 'image') {
		const body = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
		return new Response(body, { headers: { 'content-type': mimeOf(full) } });
	}
	throw error(404, 'no preview available');
};
