// On-disk thumbnail cache. Thumbs are keyed by file identity (path + mtime +
// size + width), so an edited file invalidates its own cache entry naturally
// and stale entries are just dead files. Images render through sharp; videos
// get a poster frame via ffmpeg first (skipped gracefully if ffmpeg is not
// installed). Everything is stored as webp.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';
import sharp from 'sharp';
import { kindOf } from '$lib/server/files';

const execFileP = promisify(execFile);

const CACHE_DIR = env.THUMB_CACHE_DIR ?? join(homedir(), '.cache', 'base', 'thumbs');
mkdirSync(CACHE_DIR, { recursive: true });

let ffmpegMissing = false; // remembered per process so we don't retry every row

async function posterFrame(full: string): Promise<Buffer | null> {
	if (ffmpegMissing) return null;
	// Grab one frame a second in; fall back to the first frame for short clips.
	for (const seek of ['1', '0']) {
		try {
			const { stdout } = await execFileP(
				'ffmpeg',
				['-ss', seek, '-i', full, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
				{ encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }
			);
			if (stdout.length) return stdout;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
				ffmpegMissing = true;
				return null;
			}
			// decode error at this seek — try the next one
		}
	}
	return null;
}

/** Cached webp thumbnail for an image or video file; null if not renderable. */
export async function thumbnail(full: string, w: number): Promise<Buffer | null> {
	const kind = kindOf(full);
	if (kind !== 'image' && kind !== 'video') return null;

	let stat;
	try {
		stat = statSync(full);
	} catch {
		return null;
	}
	const key = createHash('sha1').update(`${full}:${stat.mtimeMs}:${stat.size}:${w}`).digest('hex');
	const cached = join(CACHE_DIR, `${key}.webp`);
	try {
		return await readFile(cached);
	} catch {
		// miss — generate below
	}

	const source = kind === 'video' ? await posterFrame(full) : full;
	if (source === null) return null;
	let buf: Buffer;
	try {
		buf = await sharp(source, { failOn: 'none', limitInputPixels: false })
			.rotate()
			.resize(w, w, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 72 })
			.toBuffer();
	} catch {
		return null;
	}
	try {
		// Write via a unique temp name + rename so concurrent requests never
		// serve a half-written file.
		const tmp = `${cached}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
		await writeFile(tmp, buf);
		await rename(tmp, cached);
	} catch {
		// cache write failing is fine — we still have the buffer
	}
	return buf;
}
