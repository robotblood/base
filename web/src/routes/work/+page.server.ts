import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { getModule } from '$lib/modules';
import type { Item } from '$lib/types';

// The Work category page: one screen over todos, notes, and applications.
// Everything here is a rollup or a short list — the tables themselves are one
// drill-down away, so this page carries state (what's late, what's next,
// where the pipeline sits) rather than rows.

// Local YYYY-MM-DD, matching how due dates are stored (bare dates, no zone).
function todayISO(): string {
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const day = (v: unknown): string | null => str(v)?.slice(0, 10) ?? null;

export interface WorkTodo {
	id: number;
	title: string;
	status: string | null;
	due: string | null;
}

export interface WorkNote {
	id: number;
	title: string;
	kind: string | null;
	touched: string | null;
}

export interface WorkApp {
	id: number;
	role: string;
	company: string | null;
	status: string | null;
	follow_up: string | null;
}

export const load: PageServerLoad = async () => {
	let error: string | null = null;
	let todos: Item[] = [];
	let notes: Item[] = [];
	let apps: Item[] = [];
	try {
		[todos, notes, apps] = await Promise.all([
			api.list('todos'),
			api.list('notes'),
			api.list('applications')
		]);
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}

	const today = todayISO();

	// Open = not in the module's own done vocabulary, so this page and the
	// table it fronts can't disagree about what counts as finished.
	const todoDone = new Set((getModule('todos')?.doneValues ?? []).map((v) => v.toLowerCase()));
	const openTodos = todos.filter((t) => !todoDone.has(String(t.status ?? '').toLowerCase()));
	const overdue = openTodos.filter((t) => {
		const d = day(t.due);
		return d != null && d < today;
	});
	const dueToday = openTodos.filter((t) => day(t.due) === today);

	// Up next: everything late, then the nearest dated work — the same order
	// a person would triage in. Undated todos stay in the table.
	const upNext: WorkTodo[] = [...openTodos]
		.filter((t) => day(t.due) != null)
		.sort((a, b) => String(a.due).localeCompare(String(b.due)))
		.slice(0, 8)
		.map((t) => ({ id: t.id, title: String(t.title ?? ''), status: str(t.status), due: day(t.due) }));

	// Notes most recently touched. updated_at always has a value (imports
	// included), which is fine here — this list answers "where was I writing",
	// and the import run itself has long since sunk below real edits.
	const recentNotes: WorkNote[] = [...notes]
		.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
		.slice(0, 6)
		.map((n) => ({
			id: n.id,
			title: String(n.title ?? ''),
			kind: str(n.kind),
			touched: str(n.updated_at)
		}));

	// The pipeline, in the status vocabulary's own order — counts of every
	// stage that has anything in it, closed stages included (they're the
	// denominator that makes the open counts mean something).
	const appMod = getModule('applications');
	const statusOrder: string[] =
		(appMod?.fields.find((f) => f.name === 'status')?.options as string[] | undefined) ?? [];
	const pipeline = statusOrder
		.map((s) => ({ status: s, count: apps.filter((a) => String(a.status ?? '') === s).length }))
		.filter((p) => p.count > 0);
	const appDone = new Set((appMod?.doneValues ?? []).map((v) => v.toLowerCase()));
	const openApps = apps.filter((a) => !appDone.has(String(a.status ?? '').toLowerCase()));

	// Follow-ups due or past — the only application dates that are deadlines.
	const followUps: WorkApp[] = openApps
		.filter((a) => day(a.follow_up) != null)
		.sort((a, b) => String(a.follow_up).localeCompare(String(b.follow_up)))
		.slice(0, 6)
		.map((a) => ({
			id: a.id,
			role: String(a.role ?? ''),
			company: str(a.company),
			status: str(a.status),
			follow_up: day(a.follow_up)
		}));

	return {
		error,
		today,
		counts: {
			openTodos: openTodos.length,
			overdue: overdue.length,
			dueToday: dueToday.length,
			notes: notes.length,
			openApps: openApps.length
		},
		upNext,
		recentNotes,
		pipeline,
		followUps
	};
};

export const actions: Actions = {
	// Quick capture, same contract as the overview's: a bare todo into the
	// inbox, no page transition.
	capture: async ({ request }) => {
		const title = (await request.formData()).get('title')?.toString().trim();
		if (title) await api.create('todos', { title, status: 'Not started' });
		return { captured: true };
	}
};
