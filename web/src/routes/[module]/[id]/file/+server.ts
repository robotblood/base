import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { recordRoot, safeJoin, mimeOf } from '$lib/server/files';

// Streams one file from the record's folder, with Range support so video/audio
// can seek. The path is validated to stay inside the record's root.
export const GET: RequestHandler = async ({ params, url, request }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404);
	const full = safeJoin(root, url.searchParams.get('p') ?? '');
	if (!full) throw error(403, 'Invalid path');
	let stat;
	try {
		stat = statSync(full);
	} catch {
		throw error(404);
	}
	if (!stat.isFile()) throw error(404);

	const type = mimeOf(full);
	const range = request.headers.get('range');
	if (range) {
		const m = /bytes=(\d+)-(\d*)/.exec(range);
		const start = m ? parseInt(m[1], 10) : 0;
		const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
		const body = Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream;
		return new Response(body, {
			status: 206,
			headers: {
				'content-type': type,
				'content-range': `bytes ${start}-${end}/${stat.size}`,
				'accept-ranges': 'bytes',
				'content-length': String(end - start + 1)
			}
		});
	}
	const body = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
	return new Response(body, {
		headers: { 'content-type': type, 'content-length': String(stat.size), 'accept-ranges': 'bytes' }
	});
};
