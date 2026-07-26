import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { recordRoot, safeJoin } from '$lib/server/files';

// Upload files into the record's linked folder — the "add files" half of the
// files-are-folders model. Multipart form, field name "files" (repeatable).
// Names are sanitized to a bare basename; collisions get " (2)" style
// suffixes rather than overwriting anything.

const MAX_BYTES = 512 * 1024 * 1024; // single-user local system; sanity cap

export const POST: RequestHandler = async ({ params, request }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root || !existsSync(root)) throw error(404, 'no folder linked');

	const form = await request.formData().catch(() => null);
	if (!form) throw error(400, 'expected multipart form data');
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	if (!files.length) throw error(422, 'no files in request');

	const saved: string[] = [];
	for (const file of files) {
		if (file.size > MAX_BYTES) throw error(413, `${file.name} is over the 512MB upload cap`);
		let name = basename(file.name).replace(/[/\\]/g, '').trim();
		if (!name || name.startsWith('.')) throw error(422, `invalid file name: ${file.name}`);
		let target = safeJoin(root, name);
		if (!target) throw error(403, 'invalid path');
		if (existsSync(target)) {
			const ext = extname(name);
			const stem = name.slice(0, name.length - ext.length);
			for (let i = 2; existsSync(target); i++) {
				name = `${stem} (${i})${ext}`;
				target = safeJoin(root, name)!;
			}
		}
		writeFileSync(target, Buffer.from(await file.arrayBuffer()));
		saved.push(name);
	}
	return json({ saved });
};
