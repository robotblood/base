import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';
import { ensureCustomModules } from '$lib/server/customTables';
import { apiKey, getModule, MODULES, MODULE_CODES } from '$lib/modules';
import { recordHref } from '$lib/nav';
import { diversify, rank, type Candidate, type Scored, type ThreadInfo } from '$lib/rank';
import type { Item, ModuleConfig } from '$lib/types';

// Record search. The API client is server-only (see lib/server/api.ts), so the
// browser reaches it through here.
//
// GET /lookup                    → { modules: [{ key, label }] }
// GET /lookup?module=notes&q=fee → { results: [{ id, label, href }] }
// GET /lookup?q=fee              → { results: [{ id, module, code, label, href,
//                                               moduleLabel, updatedAt }] }
//
// The third form is the command palette's: one query fanned across every
// visible module. The backend searches a module's title column only
// (app/routers/__init__.py), which is what a jump-to-record palette wants —
// so the fan-out is N cheap ILIKEs over localhost rather than a new endpoint.

const PER_MODULE = 6; // keep one prolific table from crowding out the rest
const TOTAL = 24;
const PARENTS = 2; // projects pulled in behind a matched record
const PARENT_MIN_SCORE = 60; // only behind a decent hit, not a stray substring
const PARENT_GAP = 6; // how far under its child a pulled-in project sits

// Mirrors _PROJECT_CLOSED in app/main.py — the overview's test for "not a
// live thread any more", both spellings of Archive included on purpose.
const CLOSED = new Set(['done', 'archive', 'archived', 'complete', 'completed', 'cancelled']);

const SOON_DAYS = 14;

// The overview's read of the project list: which rows are live threads, and
// whether each has slipped its date or is working toward one. due_effective
// is the inherited due date the API already resolves (app/inherit.py), so a
// song counts down to its album's deadline here too.
function threadsOf(projects: Item[], now: Date): Map<number, ThreadInfo> {
	const p2 = (n: number) => String(n).padStart(2, '0');
	const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
	const today = iso(now);
	const horizon = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + SOON_DAYS));
	const out = new Map<number, ThreadInfo>();
	for (const p of projects) {
		if (CLOSED.has(String(p.status ?? '').toLowerCase())) continue;
		const raw = p.due_effective ?? p.due;
		const due = typeof raw === 'string' ? raw.slice(0, 10) : null;
		out.set(p.id, {
			late: due !== null && due < today,
			soon: due !== null && due >= today && due <= horizon
		});
	}
	return out;
}

const labelOf = (mod: ModuleConfig, row: Item) =>
	String(row[mod.titleField] ?? '').trim() || `${mod.singular} ${row.id}`;

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export const GET: RequestHandler = async ({ url }) => {
	// MODULES is a module-level array that page loads mutate to add runtime
	// tables. This endpoint isn't a page load, so on a cold server it would see
	// only the built-ins — Documents would be missing from the palette until
	// something else happened to warm the registry, which is a bug that hides
	// whenever you navigate before you search.
	await ensureCustomModules();

	const key = url.searchParams.get('module');
	const q = url.searchParams.get('q')?.trim() ?? '';

	if (!key) {
		// No module and no query is the picker asking what modules exist.
		if (!q) {
			return json({ modules: MODULES.map((m) => ({ key: m.key, label: m.label })) });
		}

		const targets = MODULES.filter((m) => !m.hidden);

		// The project list comes along unfiltered: it's what turns a project_id
		// on a matched record into a name, and its statuses and resolved due
		// dates are what let the ranker mirror the overview's hierarchy.
		const [found, projects] = await Promise.all([
			Promise.all(
				targets.map(async (mod): Promise<Candidate[]> => {
					let rows: Item[];
					try {
						rows = await api.list(apiKey(mod), q);
					} catch {
						// One table being unreachable shouldn't empty the whole palette.
						return [];
					}
					return rows.map((row) => ({
						id: row.id,
						module: mod.key,
						moduleLabel: mod.label,
						code: MODULE_CODES[mod.key] ?? '',
						label: labelOf(mod, row),
						href: recordHref(mod.key, row.id, typeof row.kind === 'string' ? row.kind : null),
						updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
						projectId: typeof row.project_id === 'number' ? row.project_id : null,
						kind: typeof row.kind === 'string' ? row.kind : null,
						weekOf: typeof row.meeting_time === 'string' ? row.meeting_time : null
					}));
				})
			),
			api.list('projects').catch(() => [] as Item[])
		]);

		// The overview's hierarchy, rebuilt from the same rows: which projects
		// are live threads and how pressed each one is. Recency is ranked among
		// the live threads only — updated_at on archived rows mostly records
		// when an import or migration last swept them, not work.
		const threads = threadsOf(projects, new Date());
		const threadRecency = new Map<number, number>(
			projects
				.filter((p) => threads.has(p.id))
				.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
				.map((p, i) => [p.id, i])
		);
		const projectById = new Map<number, Item>(projects.map((p) => [p.id, p]));

		const matched = found.flat();
		const ranked = rank(matched, { now: Date.now(), term: q, threads, threadRecency });

		// Pull in the project behind a strong hit. Looking for a record filed
		// under a project usually means you're heading for that corner of the
		// system, not just that one row — so offer the way in alongside it.
		const already = new Set(ranked.filter((r) => r.module === 'projects').map((r) => r.id));
		const parents: Scored[] = [];
		for (const r of ranked) {
			if (parents.length >= PARENTS) break;
			const pid = r.projectId;
			if (pid == null || already.has(pid) || r.score < PARENT_MIN_SCORE) continue;
			const proj = projectById.get(pid);
			if (!proj) continue;
			already.add(pid);
			parents.push({
				id: proj.id,
				module: 'projects',
				moduleLabel: 'Projects',
				code: MODULE_CODES.projects,
				label: String(proj.name ?? `project ${proj.id}`),
				href: recordHref('projects', proj.id),
				updatedAt: typeof proj.updated_at === 'string' ? proj.updated_at : null,
				// Scored straight off its child rather than run back through the
				// ranker — it lands just under the record that pulled it in, and
				// can't leapfrog the thing you actually searched for.
				score: r.score - PARENT_GAP,
				reason: `holds “${truncate(r.label, 30)}”`
			});
		}

		const results = diversify(
			[...ranked, ...parents].sort((a, b) => b.score - a.score),
			TOTAL,
			PER_MODULE
		);

		return json({ results });
	}

	const mod = getModule(key);
	if (!mod) return json({ results: [] });

	let rows;
	try {
		rows = await api.list(apiKey(mod), q || undefined);
	} catch {
		// A backend hiccup shouldn't break the dialog — the target field still
		// accepts a typed path.
		return json({ results: [] });
	}

	const results = rows.slice(0, 20).map((row) => ({
		id: row.id,
		label: labelOf(mod, row),
		href: `/${mod.key}/${row.id}`
	}));
	return json({ results });
};
