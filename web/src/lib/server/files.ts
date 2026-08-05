// Server-only helpers for previewing a record's on-disk files.
// The folder root is resolved from the stored record (by id) and cached; every
// requested file path is validated to stay inside that root (no traversal).
import { readdirSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { getModule } from '$lib/modules';
import { api } from '$lib/server/api';

const cache = new Map<string, { path: string | null; exp: number }>();

// A project's own path column (or the imported raw copy as a fallback).
function ownPath(item: Record<string, unknown>): string | null {
	const own = item.path;
	if (typeof own === 'string' && own.trim()) return own.trim();
	const raw = item.raw as { path?: unknown } | undefined;
	return typeof raw?.path === 'string' && raw.path.trim() ? raw.path.trim() : null;
}

// Projects inherit their folder from the umbrella chain (see
// $lib/projects/inherit, which does the same resolution in the browser): a
// child with no path of its own uses the nearest ancestor's folder, and a
// *relative* path resolves underneath it — so a song can be `pt1` inside the
// album's folder without repeating the prefix.
//
// Precedence is: own `path` column, then the imported `raw.path`, then an
// ancestor's folder. raw.path outranks inheritance deliberately — the 71
// imported archive projects have real folders recorded only there, and
// attaching one to an album must not hide its own files behind the album's.
// Projects created in the app have no raw.path, so inheritance is what they
// actually fall back on.
//
// The depth cap is a backstop: the UI refuses to create a cycle, but rows
// edited straight in the database could still hold one, and this walk must
// terminate either way.
const MAX_PARENT_DEPTH = 20;

async function resolveProjectPath(item: Record<string, unknown>): Promise<string | null> {
	const own = ownPath(item);
	if (own?.startsWith('/')) return own;

	const seen = new Set<number>();
	let parentId = typeof item.parent_id === 'number' ? item.parent_id : null;
	for (let i = 0; parentId != null && i < MAX_PARENT_DEPTH; i++) {
		if (seen.has(parentId)) break;
		seen.add(parentId);
		let parent;
		try {
			parent = await api.get('projects', parentId);
		} catch {
			break;
		}
		const base = ownPath(parent);
		if (base?.startsWith('/')) {
			const stem = base.replace(/\/+$/, '');
			return own ? `${stem}/${own.replace(/^\/+/, '')}` : stem;
		}
		parentId = typeof parent.parent_id === 'number' ? parent.parent_id : null;
	}
	return own;
}

export async function recordRoot(moduleKey: string, id: string): Promise<string | null> {
	const key = `${moduleKey}/${id}`;
	const hit = cache.get(key);
	if (hit && hit.exp > Date.now()) return hit.path;
	const mod = getModule(moduleKey);
	let path: string | null = null;
	if (mod) {
		try {
			const item = await api.get(mod.key, id);
			path = mod.key === 'projects' ? await resolveProjectPath(item) : ownPath(item);
		} catch {
			path = null;
		}
	}
	cache.set(key, { path, exp: Date.now() + 60_000 });
	return path;
}

// Resolve `rel` under `root`, refusing anything that escapes the root.
export function safeJoin(root: string, rel: string): string | null {
	const base = resolve(root);
	const full = resolve(base, rel);
	if (full !== base && !full.startsWith(base + sep)) return null;
	return full;
}

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif']);
const VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);
const AUDIO = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'aif', 'aiff', 'ogg', 'opus']);
const MODEL = new Set(['blend', 'fbx', 'obj', 'glb', 'gltf', 'c4d', 'ma', 'mb', 'stl', 'usd', 'usdz']);

export type Kind = 'image' | 'video' | 'audio' | 'model' | 'other';

export function kindOf(name: string): Kind {
	const e = extname(name).slice(1).toLowerCase();
	if (IMAGE.has(e)) return 'image';
	if (VIDEO.has(e)) return 'video';
	if (AUDIO.has(e)) return 'audio';
	if (MODEL.has(e)) return 'model';
	return 'other';
}

const MIME: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
	webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
	avif: 'image/avif', svg: 'image/svg+xml',
	mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
	avi: 'video/x-msvideo', mkv: 'video/x-matroska',
	mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4',
	aac: 'audio/aac', aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', opus: 'audio/opus',
	pdf: 'application/pdf', txt: 'text/plain'
};
export function mimeOf(name: string): string {
	return MIME[extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export interface MediaItem {
	rel: string;
	name: string;
	kind: Kind;
	seq?: boolean; // a collapsed render/animation sequence
	count?: number; // number of frames in the sequence
	mtime?: number; // unix ms — the hero preview promotes the newest file
}

// Render/animation frame formats — runs of these get collapsed to one tile.
// Photos are almost always JPG, which we always show individually.
const SEQ_EXT = new Set(['png', 'tif', 'tiff', 'exr', 'tga', 'dpx']);
const SEQ_MIN = 4;

// Bounded recursive walk (readdir only — no per-file stat), then collapse runs
// of sequentially-numbered render frames so they don't flood the gallery.
export function listMedia(root: string, cap = 120): { items: MediaItem[]; capped: boolean } {
	const base = resolve(root) + sep;
	const stack = [resolve(root)];
	const images: { rel: string; name: string; dir: string }[] = [];
	const av: MediaItem[] = [];
	let scanned = 0;
	while (stack.length && scanned < 20000 && images.length < 8000) {
		const dir = stack.pop()!;
		let ents;
		try {
			ents = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const ent of ents) {
			if (ent.name.startsWith('.')) continue;
			scanned++;
			if (ent.isDirectory()) {
				stack.push(resolve(dir, ent.name));
				continue;
			}
			const kind = kindOf(ent.name);
			const rel = resolve(dir, ent.name).slice(base.length);
			if (kind === 'image') images.push({ rel, name: ent.name, dir });
			else if (kind === 'video' || kind === 'audio' || kind === 'model')
				av.push({ rel, name: ent.name, kind });
		}
	}

	// Group render frames by (dir + name-prefix + ext); collapse the long runs.
	const groups = new Map<string, { rel: string; name: string; num: number }[]>();
	const out: MediaItem[] = [...av];
	for (const img of images) {
		const dot = img.name.lastIndexOf('.');
		const ext = dot >= 0 ? img.name.slice(dot + 1).toLowerCase() : '';
		const stem = dot >= 0 ? img.name.slice(0, dot) : img.name;
		const m = SEQ_EXT.has(ext) ? /^(.*?)(\d+)$/.exec(stem) : null;
		if (!m) {
			out.push({ rel: img.rel, name: img.name, kind: 'image' });
			continue;
		}
		const key = `${img.dir}\u0000${m[1]}\u0000${ext}`;
		let arr = groups.get(key);
		if (!arr) groups.set(key, (arr = []));
		arr.push({ rel: img.rel, name: img.name, num: parseInt(m[2], 10) });
	}
	for (const g of groups.values()) {
		if (g.length >= SEQ_MIN) {
			g.sort((a, b) => a.num - b.num);
			out.push({ rel: g[0].rel, name: g[0].name, kind: 'image', seq: true, count: g.length });
		} else {
			for (const f of g) out.push({ rel: f.rel, name: f.name, kind: 'image' });
		}
	}

	out.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
	const items = out.slice(0, cap);
	// The walk skips per-file stat on purpose (it can touch 20k entries); the
	// capped list is at most `cap` files, so stating just those stays cheap.
	for (const it of items) {
		try {
			it.mtime = Math.round(statSync(resolve(root, it.rel)).mtimeMs);
		} catch {
			/* vanished mid-walk — leave undefined */
		}
	}
	return { items, capped: out.length > cap };
}
