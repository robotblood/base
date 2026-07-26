// The admin section's own registry. Adding a page here puts it in the sub-nav;
// nothing else needs touching.
export type AdminSection = { key: string; label: string; href: string; blurb: string };

export const ADMIN_SECTIONS: AdminSection[] = [
	{
		key: 'health',
		label: 'Health',
		href: '/admin/health',
		blurb: 'Services, database, backups, disk'
	},
	{
		key: 'design',
		label: 'Design',
		href: '/admin/design',
		blurb: 'Typography, colour, shape — the tokens the whole app reads'
	},
	{
		key: 'data',
		label: 'Data',
		href: '/admin/data',
		blurb: 'Imported databases that aren’t modelled yet'
	}
];

// Shapes returned by the backend's /health endpoints (app/health.py).
export type DbHealth = {
	ok: boolean;
	error?: string;
	database?: string;
	version?: string;
	size_bytes?: number;
	connections?: number;
	max_connections?: number;
	started_at?: string | null;
	tables?: { table: string; est_rows: number; bytes: number }[];
	query_ms?: number;
	checked_at: string;
};

export type ApiHealth = { api: { ok: boolean; version: string }; db: DbHealth };

export type BrokenPath = { id: number; label: string | null; path: string };

export type PathHealth = {
	modules: Record<string, { with_path: number; broken: number; sample: BrokenPath[] }>;
	// Grouped by the missing directory the rows share, so an unplugged drive
	// reads as one fault. Samples carry their module so the page can link out.
	groups: {
		root: string;
		count: number;
		modules: Record<string, number>;
		sample: (BrokenPath & { module: string })[];
	}[];
	total_broken: number;
	total_with_path: number;
};

/** Severity shared by every health readout, worst-first for sorting. */
export type Level = 'down' | 'warn' | 'unknown' | 'ok';

export const LEVEL_RANK: Record<Level, number> = { down: 0, warn: 1, unknown: 2, ok: 3 };

// Fixed hex, matching the precedent in $lib/status: these encode *state*, and
// "failed" must not read as healthy because the theme flipped to dark.
export const LEVEL_COLOR: Record<Level, string> = {
	ok: '#2f7d5b',
	warn: '#c68a1a',
	down: '#b23a26',
	unknown: '#8a8478'
};

export const LEVEL_LABEL: Record<Level, string> = {
	ok: 'OK',
	warn: 'Warning',
	down: 'Down',
	unknown: 'Unknown'
};

/** Human file sizes. Binary units, because df and du report binary. */
export function bytes(n: number | null | undefined): string {
	if (!n) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let v = n;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** "3d 4h", "6h 12m", "just now" — uptime and age in one glance. */
export function since(iso: string | null | undefined, now = Date.now()): string {
	if (!iso) return '—';
	const ms = now - new Date(iso).getTime();
	if (Number.isNaN(ms)) return '—';
	const future = ms < 0;
	const abs = Math.abs(ms);
	const mins = Math.floor(abs / 60000);
	if (mins < 1) return 'just now';
	const hours = Math.floor(mins / 60);
	const days = Math.floor(hours / 24);
	const text =
		days > 0
			? `${days}d ${hours % 24}h`
			: hours > 0
				? `${hours}h ${mins % 60}m`
				: `${mins}m`;
	return future ? `in ${text}` : text;
}
