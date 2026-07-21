// Waveform peaks for audio files, cached on disk next to the thumbnails and
// keyed the same way (path + mtime + size + buckets), so edits invalidate
// naturally. ffmpeg decodes to low-rate mono PCM; we keep one peak per bucket.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';
import { kindOf } from '$lib/server/files';

const execFileP = promisify(execFile);

const CACHE_DIR = env.THUMB_CACHE_DIR ?? join(homedir(), '.cache', 'base', 'thumbs');
mkdirSync(CACHE_DIR, { recursive: true });

const RATE = 4000; // Hz — plenty for peak envelopes, keeps buffers small

export interface Wave {
	peaks: number[]; // 0..1, normalized so the loudest bucket is 1
	duration: number; // seconds (of decoded audio)
}

export async function waveform(full: string, buckets = 96): Promise<Wave | null> {
	if (kindOf(full) !== 'audio') return null;
	let stat;
	try {
		stat = statSync(full);
	} catch {
		return null;
	}
	const key = createHash('sha1')
		.update(`wave:${full}:${stat.mtimeMs}:${stat.size}:${buckets}`)
		.digest('hex');
	const cached = join(CACHE_DIR, `${key}.json`);
	try {
		return JSON.parse(await readFile(cached, 'utf8')) as Wave;
	} catch {
		// miss — decode below
	}

	let pcm: Buffer;
	try {
		({ stdout: pcm } = await execFileP(
			'ffmpeg',
			['-loglevel', 'error', '-i', full, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
			{ encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }
		));
	} catch {
		return null; // no ffmpeg, or not decodable
	}
	const samples = Math.floor(pcm.length / 2);
	if (!samples) return null;

	const peaks = new Array<number>(buckets).fill(0);
	const per = Math.max(1, Math.ceil(samples / buckets));
	for (let i = 0; i < samples; i++) {
		const v = Math.abs(pcm.readInt16LE(i * 2));
		const b = Math.min(buckets - 1, Math.floor(i / per));
		if (v > peaks[b]) peaks[b] = v;
	}
	const max = Math.max(...peaks);
	const wave: Wave = {
		peaks: peaks.map((v) => (max ? Math.round((v / max) * 1000) / 1000 : 0)),
		duration: Math.round((samples / RATE) * 10) / 10
	};
	try {
		const tmp = `${cached}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
		await writeFile(tmp, JSON.stringify(wave));
		await rename(tmp, cached);
	} catch {
		// cache write failing is fine
	}
	return wave;
}
