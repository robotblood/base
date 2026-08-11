// Ranking for the command palette.
//
// The backend matches a module's title column with a plain ILIKE, which says
// only "this row contains that substring" — every hit looks alike. What
// separates them is everything ILIKE can't see: how squarely the title matched,
// how recently the row was touched, whether it's the kind of thing you're
// usually reaching for. This scores those signals and adds them up.
//
// The weights below are the dial. They're additive on purpose: match quality
// dominates, and the rest breaks ties rather than overturning them. Among the
// tie-breakers the pecking order is the overview's — live threads and their
// records above the archive, the pressing thread above the idle one — with
// recency deliberately weighted a notch above that hierarchy.

export interface Candidate {
	id: number;
	module: string;
	moduleLabel: string;
	code: string;
	label: string;
	href: string;
	updatedAt: string | null;
	projectId?: number | null;
	kind?: string | null;
	weekOf?: string | null; // a weekly note's meeting_time — the week it covers
	reason?: string; // why a row is here when its own title didn't match
	// Set only for rows that didn't match the term themselves — a project
	// pulled in because one of its records did. Stands in for matchScore.
	baseScore?: number;
}

export interface Scored extends Candidate {
	score: number;
}

// How squarely the title matched. A whole-title hit beats a title that opens
// with the term, which beats one where some later word does, which beats a
// match buried mid-word.
export function matchScore(label: string, term: string): number {
	const l = label.toLowerCase();
	const t = term.toLowerCase();
	if (!t) return 0;
	if (l === t) return 100;
	if (l.startsWith(t)) return 70;
	// A word inside the title starting with the term — "Fall Tour" for "tour".
	if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l)) return 45;
	return 20;
}

// Recency, bucketed rather than continuous so the ordering is explainable —
// "touched today" is a real category, "touched 4.7 days ago" isn't. Weighted
// above the thread bonuses below on purpose: the overview's hierarchy says
// where the work *lives*, but the thing touched this morning is more likely
// what's being reached for than the thread that's been urgent for a month.
export function recencyScore(updatedAt: string | null, now: number): number {
	if (!updatedAt) return 0;
	const utc = /[Zz]|[+-]\d\d:?\d\d$/.test(updatedAt) ? updatedAt : updatedAt + 'Z';
	const days = (now - new Date(utc).getTime()) / 86_400_000;
	if (Number.isNaN(days)) return 0;
	if (days < 1) return 30;
	if (days < 3) return 22;
	if (days < 7) return 15;
	if (days < 30) return 8;
	if (days < 90) return 3;
	return 0;
}

// Where the work actually happens. Everything unlisted gets DEFAULT_WEIGHT —
// including custom tables, except the ones named here.
export const MODULE_WEIGHT: Record<string, number> = {
	projects: 14,
	notes: 12,
	todos: 11,
	documents: 10,
	applications: 9,
	events: 6,
	incidents: 4,
	learning: 4,
	budgets: 4,
	transactions: 4
};

const DEFAULT_WEIGHT = 3;

// Standing bonuses for the two rows most often being reached for.
const WEEKLY_KIND = 12; // any weekly note
const NEWEST_WEEKLY = 40; // *this* week's — enough to clear a same-quality match

// The overview's hierarchy, carried into search. A thread is a project the
// home screen shows — status not closed — and the tiers mirror its headline
// logic: the thread that slipped its date outranks one working to a date,
// which outranks a thread with no date pressing. Archived projects get none
// of this; 73 of the 81 projects are closed imports, and a migration's bulk
// updated_at stamp had been making them read as "recently touched".
const LIVE_THREAD = 15; // any overview thread
const LATE_THREAD = 10; // slipped its resolved due date — the headline slot
const SOON_THREAD = 6; // due (or opening) inside two weeks
const NEWEST_PROJECT = 20; // the *thread* touched most recently
const ACTIVE_PROJECT_CHILD = 14; // a record filed under a live thread
const PROJECT_CHILD = 5; // filed under any project at all

// Which weekly note is "this week's" is already decided on the overview, which
// pins the newest `kind='weekly'` note by meeting_time (app/main.py). Same test
// here, so the rail and the palette can't disagree about which one is current.
//
// The kind check is what does the work: an imported note titled
// "Weekly — 2026-07-20" with kind='note' isn't a weekly workspace, and reading
// the date out of the title would wrongly treat it as one. Title parsing is
// only a fallback for a weekly whose meeting_time never got set.
const WEEKLY_TITLE = /^weekly\s*[—–-]\s*(\d{4}-\d{2}-\d{2})/i;

export function weeklyStamp(c: Candidate): string | null {
	if (c.module !== 'notes' || c.kind !== 'weekly') return null;
	if (c.weekOf) return c.weekOf;
	const m = WEEKLY_TITLE.exec(c.label);
	return m ? m[1] : (c.updatedAt ?? '');
}

// A live thread's standing on the overview. Presence in the map is the
// liveness test — closed projects simply aren't in it.
export interface ThreadInfo {
	late: boolean; // past its resolved due date
	soon: boolean; // a date inside the two-week window
}

export interface RankContext {
	now: number;
	/** What was typed — scored against each title. */
	term: string;
	/** Project id → overview standing, for live threads only. */
	threads: Map<number, ThreadInfo>;
	/** Live thread id → how recently it was touched, 0 being the most recent. */
	threadRecency: Map<number, number>;
}

/**
 * Score every candidate and return them best-first.
 *
 * Two of the bonuses are singular — the newest weekly note and the most
 * recently touched project — so they're resolved across the whole set here
 * rather than per row.
 */
export function rank(candidates: Candidate[], ctx: RankContext): Scored[] {
	// The newest weekly present in this result set, by the date in its title.
	let newestWeekly: { id: number; stamp: string } | null = null;
	for (const c of candidates) {
		const stamp = weeklyStamp(c);
		if (stamp === null) continue;
		if (!newestWeekly || stamp > newestWeekly.stamp) newestWeekly = { id: c.id, stamp };
	}

	// The most recently touched live thread present in this result set.
	let topProject: number | null = null;
	let topProjectRank = Infinity;
	for (const c of candidates) {
		if (c.module !== 'projects') continue;
		const r = ctx.threadRecency.get(c.id) ?? Infinity;
		if (r < topProjectRank) {
			topProjectRank = r;
			topProject = c.id;
		}
	}

	return candidates
		.map((c) => {
			let score = c.baseScore ?? matchScore(c.label, ctx.term);
			score += MODULE_WEIGHT[c.module] ?? DEFAULT_WEIGHT;
			score += recencyScore(c.updatedAt, ctx.now);

			if (weeklyStamp(c) !== null) {
				score += WEEKLY_KIND;
				if (newestWeekly && c.id === newestWeekly.id) score += NEWEST_WEEKLY;
			}

			if (c.module === 'projects') {
				const t = ctx.threads.get(c.id);
				if (t) {
					score += LIVE_THREAD;
					score += t.late ? LATE_THREAD : t.soon ? SOON_THREAD : 0;
				}
				if (c.id === topProject) score += NEWEST_PROJECT;
			}

			if (c.projectId != null) {
				score += ctx.threads.has(c.projectId) ? ACTIVE_PROJECT_CHILD : PROJECT_CHILD;
			}

			return { ...c, score };
		})
		.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/**
 * Take the best `total`, but never more than `perModule` from any one table —
 * otherwise a prolific table (463 notes) buries everything else on a broad
 * term. Applied after scoring, so what gets dropped is genuinely the weakest.
 */
export function diversify<T extends { module: string }>(
	rows: T[],
	total: number,
	perModule: number
): T[] {
	const seen = new Map<string, number>();
	const out: T[] = [];
	for (const r of rows) {
		if (out.length >= total) break;
		const n = seen.get(r.module) ?? 0;
		if (n >= perModule) continue;
		seen.set(r.module, n + 1);
		out.push(r);
	}
	return out;
}
