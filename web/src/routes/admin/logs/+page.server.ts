import { env } from '$env/dynamic/private';
import { JOURNAL_UNITS, journalTail, type JournalTail } from '$lib/server/host';
import type { CheckHistory, LogEntry } from '$lib/admin';
import type { PageServerLoad } from './$types';

const API = env.API_BASE_URL ?? 'http://127.0.0.1:8000';

// Same reasoning as the health page: the log is where you look *because*
// something is wrong, so an unreachable API has to render an empty page with a
// note rather than an error screen.
async function fromApi<T>(path: string, fallback: T, timeoutMs = 8000): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${API}${path}`, { signal: ctrl.signal });
		return res.ok ? ((await res.json()) as T) : fallback;
	} catch {
		return fallback;
	} finally {
		clearTimeout(timer);
	}
}

const WINDOWS = [1, 6, 24, 168, 720];

export const load: PageServerLoad = async ({ url }) => {
	const view = url.searchParams.get('view') === 'journal' ? 'journal' : 'events';
	const level = url.searchParams.get('level') ?? '';
	const source = url.searchParams.get('source') ?? '';
	const q = url.searchParams.get('q') ?? '';
	const hours = Number(url.searchParams.get('hours')) || 24;
	const unit = url.searchParams.get('unit') ?? JOURNAL_UNITS[0].unit;

	const params = new URLSearchParams({ limit: '300', since_hours: String(hours) });
	if (level) params.set('level', level);
	if (source) params.set('source', source);
	if (q) params.set('q', q);

	// The journal is only read when its view is open — see journalTail().
	const [entries, checks, journal] = await Promise.all([
		fromApi<LogEntry[]>(`/log?${params}`, []),
		fromApi<CheckHistory>(`/log/checks?hours=${Math.max(hours, 24)}`, {
			hours,
			sources: [],
			series: {}
		}),
		view === 'journal'
			? journalTail(unit)
			: Promise.resolve<JournalTail>({ unit, lines: [] })
	]);

	return {
		entries,
		checks,
		journal,
		units: JOURNAL_UNITS,
		filters: { view, level, source, q, hours, unit },
		windows: WINDOWS,
		apiReachable: entries.length > 0 || Object.keys(checks.series).length > 0
	};
};
