import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { recordRoot, safeJoin } from '$lib/server/files';
import { api } from '$lib/server/api';

// File management inside a record's folder — everything stays within the
// validated root; renames/moves never cross it.
//
// GET  → { dirs: string[] }  relative subdirectories (move targets)
// POST { p, op: 'rename', to: <new name> }
// POST { p, op: 'move',   to: <relative dir, '' = root> }
//      → { rel: <new relative path> }

export const GET: RequestHandler = async ({ params }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404);
	const base = resolve(root) + sep;
	const stack = [resolve(root)];
	const dirs: string[] = [];
	while (stack.length && dirs.length < 500) {
		const dir = stack.pop()!;
		let ents;
		try {
			ents = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const ent of ents) {
			if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
			const full = resolve(dir, ent.name);
			dirs.push(full.slice(base.length));
			stack.push(full);
		}
	}
	dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	return json({ dirs });
};

// A renamed/moved file keeps its rundown attachments pointing at it.
async function fixRundownRefs(module: string, id: string, oldRel: string, newRel: string) {
	if (module !== 'projects') return;
	try {
		const row = await api.get('projects', id);
		const rundown = row.rundown as
			| { sections: { songs: { files: { rel?: string; name: string }[] }[] }[] }
			| null;
		if (!rundown) return;
		let touched = false;
		for (const sec of rundown.sections ?? [])
			for (const song of sec.songs ?? [])
				for (const f of song.files ?? [])
					if (f.rel === oldRel) {
						f.rel = newRel;
						f.name = basename(newRel);
						touched = true;
					}
		if (touched) await api.update('projects', id, { rundown });
	} catch {
		// best-effort — a stale attachment name is annoying, not fatal
	}
}

export const POST: RequestHandler = async ({ params, request }) => {
	const { p = '', op, to = '' } = (await request.json().catch(() => ({}))) as {
		p?: string;
		op?: string;
		to?: string;
	};
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404, 'no folder linked');
	const full = safeJoin(root, p);
	if (!full) throw error(403, 'invalid path');
	try {
		if (!statSync(full).isFile()) throw new Error();
	} catch {
		throw error(404, 'not found on disk');
	}

	let targetRel: string;
	if (op === 'rename') {
		const name = to.trim();
		if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.'))
			throw error(422, 'invalid name');
		targetRel = join(dirname(p), name);
	} else if (op === 'move') {
		const dirFull = safeJoin(root, to);
		if (!dirFull) throw error(403, 'invalid target');
		try {
			if (!statSync(dirFull).isDirectory()) throw new Error();
		} catch {
			throw error(404, 'target folder not found');
		}
		targetRel = join(to, basename(p));
	} else {
		throw error(400, `unknown op: ${op}`);
	}

	const target = safeJoin(root, targetRel);
	if (!target) throw error(403, 'invalid target');
	if (target !== full && existsSync(target)) throw error(409, 'a file with that name already exists');
	if (target !== full) {
		renameSync(full, target);
		await fixRundownRefs(params.module, params.id, p, targetRel);
	}
	return json({ rel: targetRel });
};
