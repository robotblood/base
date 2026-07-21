import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { recordRoot, safeJoin, mimeOf } from '$lib/server/files';

// A resized webp thumbnail for an image in the record's folder, so large
// renders stay light in the grid. Falls back to the original on any failure.
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
	try {
		const buf = await sharp(full, { failOn: 'none', limitInputPixels: false })
			.rotate()
			.resize(w, w, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 72 })
			.toBuffer();
		return new Response(buf, {
			headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' }
		});
	} catch {
		const body = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
		return new Response(body, { headers: { 'content-type': mimeOf(full) } });
	}
};
