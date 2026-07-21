import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { kindOf } from '$lib/server/files';

// Directory browser for the folder picker. Local single-user app, but still
// sandboxed: only home and mounted drives are browsable, and only directories
// are ever listed — file contents go through the record-scoped endpoints.
const ROOTS = [homedir(), '/media'];

function allowed(p: string): boolean {
	const full = resolve(p);
	return ROOTS.some((r) => full === r || full.startsWith(r + sep));
}

// GET /browse           → { roots: string[] }
// GET /browse?p=<dir>   → { path, parent, dirs: [{name, path}], mediaCount }
export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams.get('p');
	if (!p) return json({ roots: ROOTS.filter((r) => existsSync(r)) });
	if (!allowed(p)) throw error(403, 'outside browsable roots');

	const full = resolve(p);
	let entries;
	try {
		entries = readdirSync(full, { withFileTypes: true });
	} catch {
		throw error(404, 'cannot read folder — is the drive mounted?');
	}
	const dirs = entries
		.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
		.map((e) => ({ name: e.name, path: resolve(full, e.name) }))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	const mediaCount = entries.filter(
		(e) => e.isFile() && !e.name.startsWith('.') && kindOf(e.name) !== 'other'
	).length;
	const parent = dirname(full);
	return json({
		path: full,
		parent: parent !== full && allowed(parent) ? parent : null,
		dirs,
		mediaCount
	});
};
