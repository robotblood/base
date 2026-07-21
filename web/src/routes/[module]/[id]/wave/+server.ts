import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { statSync } from 'node:fs';
import { recordRoot, safeJoin } from '$lib/server/files';
import { waveform } from '$lib/server/waves';

// Waveform peaks for an audio file in the record's folder (cached on disk).
// 404s when the file isn't decodable audio — clients fall back to a swatch.
export const GET: RequestHandler = async ({ params, url }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404);
	const full = safeJoin(root, url.searchParams.get('p') ?? '');
	if (!full) throw error(403);
	try {
		if (!statSync(full).isFile()) throw new Error();
	} catch {
		throw error(404);
	}

	const wave = await waveform(full);
	if (!wave) throw error(404, 'no waveform available');
	return json(wave, { headers: { 'cache-control': 'private, max-age=86400' } });
};
