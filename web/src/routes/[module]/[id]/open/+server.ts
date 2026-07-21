import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execFile, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { recordRoot, safeJoin } from '$lib/server/files';

const execFileP = promisify(execFile);

// Opens a file in its native app, or reveals it in the file manager, on the
// machine running the app — this is a local single-user system, and the path
// is validated to stay inside the record's folder. With no `p`, acts on the
// record's folder itself.
//
// Body: { p?: string; mode?: 'open' | 'reveal' }

function xdgOpen(target: string) {
	spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
}

async function reveal(full: string) {
	// The freedesktop FileManager1 interface opens the folder *with the file
	// selected* (GNOME/KDE/most). Fall back to opening the containing dir.
	try {
		await execFileP('dbus-send', [
			'--session',
			'--print-reply',
			'--dest=org.freedesktop.FileManager1',
			'/org/freedesktop/FileManager1',
			'org.freedesktop.FileManager1.ShowItems',
			`array:string:${pathToFileURL(full).href}`,
			'string:'
		]);
	} catch {
		xdgOpen(dirname(full));
	}
}

export const POST: RequestHandler = async ({ params, request }) => {
	const { p = '', mode = 'open' } = (await request.json().catch(() => ({}))) as {
		p?: string;
		mode?: string;
	};
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404, 'no folder linked');
	const full = p ? safeJoin(root, p) : root;
	if (!full) throw error(403, 'invalid path');
	try {
		statSync(full);
	} catch {
		throw error(404, 'not found on disk');
	}

	if (mode === 'reveal') await reveal(full);
	else xdgOpen(full);
	return json({ ok: true });
};
