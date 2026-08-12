// Host-side health: the systemd units, the Postgres container, the backup
// snapshots, disk headroom, and the thumbnail cache.
//
// These live in the *web* server rather than the FastAPI backend on purpose. A
// check that reports "base-api is down" cannot itself be served by base-api —
// the one moment you need that answer is the moment it can't reply. The web
// server runs as the same user, so `systemctl --user` and the home directory
// are both directly reachable from here.
import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';

const run = promisify(execFile);

const BACKUP_DIR = env.BACKUP_DIR ?? join(homedir(), 'backups', 'base');
const CACHE_DIR = env.THUMB_CACHE_DIR ?? join(homedir(), '.cache', 'base', 'thumbs');

// Every probe shells out. A wedged docker daemon or a spun-down disk must slow
// the page, not hang it — so each call gets its own ceiling and a failed probe
// degrades to an "unknown" card instead of a 500.
const TIMEOUT = 4000;

async function sh(cmd: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await run(cmd, args, { timeout: TIMEOUT, encoding: 'utf8' });
		return stdout;
	} catch {
		return null;
	}
}

/** Parse `systemctl show` Key=Value output into a map. */
function parseShow(out: string): Record<string, string> {
	const map: Record<string, string> = {};
	for (const line of out.split('\n')) {
		const i = line.indexOf('=');
		if (i > 0) map[line.slice(0, i)] = line.slice(i + 1).trim();
	}
	return map;
}

// systemd prints timestamps like "Sun 2026-07-26 07:49:30 CDT". Date.parse
// chokes on the leading weekday and the trailing zone abbreviation, so trim to
// the part it does understand and let the server's own zone apply.
function systemdDate(value: string | undefined): string | null {
	if (!value || value === 'n/a') return null;
	const m = value.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
	if (!m) return null;
	const parsed = new Date(m[1].replace(' ', 'T'));
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export type UnitHealth = {
	unit: string;
	label: string;
	/** ok = running as intended, warn = loaded but not active, down = failed/absent */
	state: 'ok' | 'warn' | 'down' | 'unknown';
	active: string;
	sub: string;
	since: string | null;
	restarts: number;
	result: string;
	/** Populated only when something is wrong — the tail of the unit's log. */
	log?: string;
};

const UNITS: { unit: string; label: string }[] = [
	{ unit: 'base-api', label: 'API (base-server · Rust, :8000)' },
	{ unit: 'base-web', label: 'Web (SvelteKit, :3000)' },
	{ unit: 'base-backup.timer', label: 'Backup timer (daily)' }
];

async function unitHealth({ unit, label }: { unit: string; label: string }): Promise<UnitHealth> {
	const out = await sh('systemctl', [
		'--user',
		'show',
		unit,
		'--property=ActiveState,SubState,NRestarts,ExecMainStartTimestamp,ActiveEnterTimestamp,Result,LoadState'
	]);
	if (!out) {
		return {
			unit,
			label,
			state: 'unknown',
			active: 'unknown',
			sub: '',
			since: null,
			restarts: 0,
			result: ''
		};
	}
	const p = parseShow(out);
	const active = p.ActiveState ?? 'unknown';
	const loaded = p.LoadState === 'loaded';
	// A timer's healthy SubState is "waiting"; a service's is "running". Treat
	// any active unit as ok and let the SubState show through on the card.
	const state: UnitHealth['state'] = !loaded
		? 'down'
		: active === 'active'
			? 'ok'
			: active === 'failed'
				? 'down'
				: 'warn';

	const health: UnitHealth = {
		unit,
		label,
		state,
		active,
		sub: p.SubState ?? '',
		since: systemdDate(p.ExecMainStartTimestamp || p.ActiveEnterTimestamp),
		restarts: Number(p.NRestarts ?? 0) || 0,
		result: p.Result ?? ''
	};
	if (state !== 'ok') {
		const log = await sh('journalctl', ['--user', '-u', unit, '-n', '12', '--no-pager', '-o', 'cat']);
		if (log) health.log = log.trim();
	}
	return health;
}

export type ContainerHealth = {
	name: string;
	state: 'ok' | 'warn' | 'down' | 'unknown';
	status: string;
	health: string;
	since: string | null;
	restarts: number;
};

async function containerHealth(name = 'base-db'): Promise<ContainerHealth> {
	const out = await sh('docker', [
		'inspect',
		name,
		'--format',
		'{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.StartedAt}}|{{.RestartCount}}'
	]);
	if (!out) {
		return { name, state: 'down', status: 'not found', health: '', since: null, restarts: 0 };
	}
	const [status, health, startedAt, restarts] = out.trim().split('|');
	const since = new Date(startedAt);
	return {
		name,
		state:
			status === 'running' && (health === 'healthy' || health === 'none')
				? 'ok'
				: status === 'running'
					? 'warn'
					: 'down',
		status,
		health,
		since: Number.isNaN(since.getTime()) ? null : since.toISOString(),
		restarts: Number(restarts) || 0
	};
}

export type BackupHealth = {
	dir: string;
	state: 'ok' | 'warn' | 'down' | 'unknown';
	count: number;
	monthly: number;
	total_bytes: number;
	newest: { name: string; bytes: number; at: string } | null;
	age_hours: number | null;
	next_run: string | null;
	note: string;
};

/** Snapshots on disk, their age, and when the timer fires next.
 *
 *  Age comes from the newest dump's mtime rather than the timer's
 *  LastTriggerUSec: the timer reports nothing across a reboot, and what
 *  actually matters is whether a *file* exists to restore from. */
async function backupHealth(): Promise<BackupHealth> {
	const base: BackupHealth = {
		dir: BACKUP_DIR,
		state: 'unknown',
		count: 0,
		monthly: 0,
		total_bytes: 0,
		newest: null,
		age_hours: null,
		next_run: null,
		note: ''
	};

	const timer = await sh('systemctl', [
		'--user',
		'show',
		'base-backup.timer',
		'--property=NextElapseUSecRealtime,ActiveState'
	]);
	const timerProps = timer ? parseShow(timer) : {};
	base.next_run = systemdDate(timerProps.NextElapseUSecRealtime);

	let entries: string[];
	try {
		entries = await readdir(BACKUP_DIR);
	} catch {
		return { ...base, state: 'down', note: 'Backup directory does not exist' };
	}

	const dumps = entries.filter((f) => f.endsWith('.dump'));
	const stats = await Promise.all(
		dumps.map(async (name) => {
			try {
				const s = await stat(join(BACKUP_DIR, name));
				return { name, bytes: s.size, at: s.mtime.toISOString(), ms: s.mtimeMs };
			} catch {
				return null;
			}
		})
	);
	const found = stats.filter((s): s is NonNullable<typeof s> => s !== null);
	found.sort((a, b) => b.ms - a.ms);

	let monthly = 0;
	try {
		monthly = (await readdir(join(BACKUP_DIR, 'monthly'))).filter((f) => f.endsWith('.dump')).length;
	} catch {
		monthly = 0;
	}

	if (found.length === 0) {
		return { ...base, monthly, state: 'down', note: 'No snapshots — nothing to restore from' };
	}

	const newest = found[0];
	const ageHours = (Date.now() - newest.ms) / 3_600_000;
	// The timer is daily; a snapshot older than two days means it has not been
	// firing, which is exactly the failure this page exists to surface.
	const state = ageHours > 48 ? 'down' : ageHours > 26 ? 'warn' : 'ok';
	return {
		...base,
		state,
		count: found.length,
		monthly,
		total_bytes: found.reduce((sum, f) => sum + f.bytes, 0),
		newest: { name: newest.name, bytes: newest.bytes, at: newest.at },
		age_hours: Math.round(ageHours * 10) / 10,
		note:
			state === 'ok'
				? ''
				: `Newest snapshot is ${Math.floor(ageHours / 24)}d old — check base-backup.timer`
	};
}

export type DiskHealth = {
	path: string;
	label: string;
	state: 'ok' | 'warn' | 'down' | 'unknown';
	total_bytes: number;
	free_bytes: number;
	used_pct: number;
};

async function diskHealth(path: string, label: string): Promise<DiskHealth> {
	const out = await sh('df', ['-B1', '--output=size,avail,pcent', path]);
	if (!out) {
		return { path, label, state: 'unknown', total_bytes: 0, free_bytes: 0, used_pct: 0 };
	}
	const line = out.trim().split('\n').pop() ?? '';
	const [size, avail, pcent] = line.trim().split(/\s+/);
	const used = Number((pcent ?? '').replace('%', '')) || 0;
	return {
		path,
		label,
		state: used >= 95 ? 'down' : used >= 85 ? 'warn' : 'ok',
		total_bytes: Number(size) || 0,
		free_bytes: Number(avail) || 0,
		used_pct: used
	};
}

export type CacheHealth = { dir: string; bytes: number; files: number };

async function cacheHealth(): Promise<CacheHealth> {
	let files: string[] = [];
	try {
		files = await readdir(CACHE_DIR);
	} catch {
		return { dir: CACHE_DIR, bytes: 0, files: 0 };
	}
	const sizes = await Promise.all(
		files.map(async (f) => {
			try {
				return (await stat(join(CACHE_DIR, f))).size;
			} catch {
				return 0;
			}
		})
	);
	return { dir: CACHE_DIR, bytes: sizes.reduce((a, b) => a + b, 0), files: files.length };
}

export const JOURNAL_UNITS = [
	{ unit: 'base-api', label: 'API' },
	{ unit: 'base-web', label: 'Web' },
	{ unit: 'base-selfcheck', label: 'Self-checks' },
	{ unit: 'base-backup', label: 'Backups' }
];

export type JournalTail = { unit: string; lines: string[]; error?: string };

/** Raw stdout/stderr for a unit — the half of the story Postgres doesn't hold.
 *
 *  Loaded only when the journal view is open: shelling out to journalctl for
 *  four units on every page load would be a needless second or so on a page
 *  whose default view doesn't show any of it. */
export async function journalTail(unit: string, lines = 200): Promise<JournalTail> {
	if (!JOURNAL_UNITS.some((u) => u.unit === unit)) {
		return { unit, lines: [], error: 'unknown unit' };
	}
	const out = await sh('journalctl', [
		'--user',
		'-u',
		unit,
		'-n',
		String(Math.min(lines, 1000)),
		'--no-pager',
		'-o',
		'short-iso'
	]);
	if (out === null) return { unit, lines: [], error: 'journalctl unavailable' };
	return { unit, lines: out.split('\n').filter(Boolean) };
}

export type HostHealth = {
	units: UnitHealth[];
	container: ContainerHealth;
	backups: BackupHealth;
	disks: DiskHealth[];
	cache: CacheHealth;
	checked_at: string;
};

/** Every host probe, run concurrently. */
export async function hostHealth(): Promise<HostHealth> {
	const [units, container, backups, home, backupDisk, cache] = await Promise.all([
		Promise.all(UNITS.map(unitHealth)),
		containerHealth(),
		backupHealth(),
		diskHealth(homedir(), 'Home'),
		diskHealth(BACKUP_DIR, 'Backups'),
		cacheHealth()
	]);

	// Backups usually sit on the home volume; only show the second bar when it
	// is genuinely a different filesystem.
	const disks =
		backupDisk.total_bytes && backupDisk.total_bytes !== home.total_bytes
			? [home, backupDisk]
			: [home];

	return { units, container, backups, disks, cache, checked_at: new Date().toISOString() };
}
