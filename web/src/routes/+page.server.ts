import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { moneyPulse, day, type MoneyPulse } from '$lib/server/money';
import type { DashboardData, DayFocus, FocusItem, Item, WeekTask, WorkSession } from '$lib/types';

// Monday of the current week, as YYYY-MM-DD — one weekly note per week.
function mondayISO(): string {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Local YYYY-MM-DD — the day a focus plan belongs to.
function todayISO(): string {
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const WEEKLY_TEMPLATE = `## Tasks
- [ ]

## Focus
-

## Log
-

## Parking lot
-
`;

// Checkbox lines from a note body — the weekly note's "## Tasks" checklist,
// surfaced on the Overview as this week's task list. `line` is the row's index
// in the body, which is what the toggle action edits by. Indented checkboxes
// are subtasks: `depth` drives the card's indentation and `parent` names the
// nearest shallower task, so "Graphics" can say what it belongs to.
function parseTasks(body: string): WeekTask[] {
	const out: WeekTask[] = [];
	const stack: { depth: number; text: string }[] = [];
	body.split('\n').forEach((raw, line) => {
		// Notes written in the editor carry \r\n endings; the stray \r would
		// make the line regex miss every task.
		const m = /^(\s*)[-*]\s*\[([ xX])\]\s*(.+)$/.exec(raw.replace(/\r$/, ''));
		if (!m) return;
		const depth = Math.min(Math.floor(m[1].replace(/\t/g, '  ').length / 2), 4);
		const text = m[3].trim();
		while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
		out.push({ text, done: m[2] !== ' ', line, depth, parent: stack.at(-1)?.text ?? null });
		stack.push({ depth, text });
	});
	return out;
}

// Insert one line at the end of the weekly's "## Log" section (growing the
// section if the note lost it), preserving the body's own line endings.
function appendLog(body: string, entry: string): string {
	const lines = body.split('\n');
	const clean = (s: string) => s.replace(/\r$/, '');
	const cr = body.includes('\r\n') ? '\r' : '';
	let at = lines.findIndex((l) => clean(l).trim() === '## Log');
	if (at === -1) {
		while (lines.length && clean(lines[lines.length - 1]).trim() === '') lines.pop();
		lines.push(cr, `## Log${cr}`);
		at = lines.length - 1;
	}
	// Stop at the next heading (or EOF), then back over the blank lines before
	// it so the entry joins the section's bullets.
	let end = lines.length;
	for (let i = at + 1; i < lines.length; i++)
		if (clean(lines[i]).startsWith('## ')) {
			end = i;
			break;
		}
	while (end > at + 1 && clean(lines[end - 1]).trim() === '') end--;
	lines.splice(end, 0, `${entry}${cr}`);
	return lines.join('\n');
}

// "1h 20m" / "47m" — for session log lines and the live timer chip.
function fmtDur(mins: number): string {
	return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

// Sunday of the current week — the redesign's day strip runs Sun→Sat.
function sundayISO(): string {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	d.setDate(d.getDate() - d.getDay());
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DayStripItem {
	c: 'events' | 'todos' | 'projects' | 'notes';
	t: string;
	href: string;
}
export interface StripDay {
	iso: string;
	dow: string;
	num: number;
	today: boolean;
	items: DayStripItem[];
}

export interface AssistBrief {
	id: number;
	kind: string;
	source: string;
	title: string;
	why: string;
	writes: string;
}

export const load: PageServerLoad = async () => {
	let dashboard: DashboardData | null = null;
	let apiError: string | null = null;
	let latestShow: { id: number; name: string } | null = null;
	let weekNote: { id: number; tasks: WeekTask[] } | null = null;
	let focus: DayFocus | null = null;
	let session: WorkSession | null = null;
	let tallyToday = 0;
	let money: MoneyPulse | null = null;
	let week: StripDay[] = [];
	let assistTop: AssistBrief[] = [];
	let assistPending = 0;
	try {
		// Threads, recent notes and loose ends all come from /dashboard now; the
		// only things left to resolve here are the two quick-action targets, the
		// day's focus plan, the running session, and the week-task half of the
		// done-today tally.
		dashboard = await api.dashboard();
		const weeklyTitle = `Weekly — ${mondayISO()}`;
		const [projects, weekly, focusRaw, tallyRaw, sessionRaw, txns, budgets, events, todos, pending] =
			await Promise.all([
				api.list('projects'),
				api.list('notes', weeklyTitle),
				api.getSetting('day_focus'),
				api.getSetting('day_tally'),
				api.getSetting('work_session'),
				api.list('transactions').catch((): Item[] => []),
				api.list('budgets').catch((): Item[] => []),
				api.list('events').catch((): Item[] => []),
				api.list('todos').catch((): Item[] => []),
				api.assistSuggestions('pending').catch((): Item[] => [])
			]);
		money = moneyPulse(txns, budgets);
		assistPending = pending.length;
		assistTop = (pending as unknown as AssistBrief[])
			.slice(0, 3)
			.map(({ id, kind, source, title, why, writes }) => ({ id, kind, source, title, why, writes }));

		// The Sun→Sat strip: everything dated that lands this week, colored by
		// where it lives. Notes ride on their meeting_time (the weekly's stamp).
		const sunday = new Date(sundayISO() + 'T00:00:00');
		const strip = new Map<string, StripDay>();
		for (let i = 0; i < 7; i++) {
			const dt = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
			const p2 = (n: number) => String(n).padStart(2, '0');
			const iso = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
			strip.set(iso, {
				iso,
				dow: dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
				num: dt.getDate(),
				today: iso === todayISO(),
				items: []
			});
		}
		const put = (iso: string | null, item: DayStripItem) => {
			if (iso && strip.has(iso)) strip.get(iso)!.items.push(item);
		};
		for (const e of events)
			put(day(e.starts_at), {
				c: 'events',
				t: String(e.title),
				href: e.kind === 'performance' ? `/shows/${e.id}` : `/events/${e.id}`
			});
		for (const t of todos)
			if (!['done', 'archived'].includes(String(t.status ?? '').toLowerCase()))
				put(day(t.due), { c: 'todos', t: String(t.title), href: `/todos/${t.id}` });
		for (const t of dashboard.threads)
			put(day(t.due_effective ?? t.due), { c: 'projects', t: t.name, href: `/projects?open=${t.id}` });
		for (const n of weekly)
			put(day(n.meeting_time), { c: 'notes', t: String(n.title), href: `/notes/${n.id}` });
		week = [...strip.values()];
		const tr = tallyRaw as { date?: string; week_tasks?: number } | null;
		if (tr?.date === todayISO()) tallyToday = tr.week_tasks ?? 0;
		const sr = sessionRaw as Partial<WorkSession> | null;
		if (sr?.started_at && Number.isFinite(Date.parse(sr.started_at)) && sr.label)
			session = sr as WorkSession;
		// This week's running note, if it's been started — its "## Tasks"
		// checklist is the week's working list.
		const wn = weekly.find((n) => n.title === weeklyTitle);
		if (wn) weekNote = { id: wn.id as number, tasks: parseTasks(String(wn.body ?? '')) };
		// Most recently updated project with a rundown — the "New song" target.
		const withRundown = projects
			.filter((p) => p.rundown)
			.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
		if (withRundown.length)
			latestShow = { id: withRundown[0].id as number, name: String(withRundown[0].name) };
		// Today's plan, if the ritual has been run. Yesterday's plan is not
		// today's — a stale date reads as "no plan yet".
		const f = focusRaw as Partial<DayFocus> | null;
		if (f && f.date === todayISO() && Array.isArray(f.items) && f.items.length)
			focus = f as DayFocus;
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return {
		dashboard,
		apiError,
		latestShow,
		weekNote,
		focus,
		session,
		tallyToday,
		weekOf: mondayISO(),
		money,
		week,
		assistTop,
		assistPending
	};
};

// Find this week's running note, creating it from the template the first time.
async function ensureWeekly(): Promise<{ id: number; body: string }> {
	const monday = mondayISO();
	const title = `Weekly — ${monday}`;
	const found = (await api.list('notes', title)).find((n) => n.title === title);
	if (found) return { id: found.id as number, body: String(found.body ?? '') };
	const made = await api.create('notes', {
		title,
		kind: 'weekly',
		// Stamped with the week it covers. Notes sort by meeting_time and
		// undated rows sort last whatever the direction (views.ts), so without
		// this the new note lands at the bottom of the table among the 400-odd
		// undated imports instead of with its own week.
		meeting_time: `${monday}T00:00:00`,
		body: WEEKLY_TEMPLATE
	});
	return { id: made.id as number, body: WEEKLY_TEMPLATE };
}

export const actions: Actions = {
	// Open this week's note, creating it from the template the first time.
	weekly: async () => {
		const { id } = await ensureWeekly();
		redirect(303, `/notes/${id}`);
	},
	// The start-of-day ritual: stamp today into the weekly's "## Log" and save
	// the 1–3 picked focus items as the day_focus setting. One press turns
	// "I should get going" into a decision already made — the overview
	// re-renders around the plan.
	startDay: async ({ request }) => {
		const items: FocusItem[] = [];
		for (const raw of (await request.formData()).getAll('item')) {
			try {
				const it = JSON.parse(String(raw));
				if (it?.kind === 'task' && typeof it.text === 'string' && Number.isInteger(it.line))
					items.push({ kind: 'task', text: it.text, line: it.line });
				else if (it?.kind === 'thread' && Number.isInteger(it.id) && typeof it.name === 'string')
					items.push({ kind: 'thread', id: it.id, name: it.name });
			} catch {
				// a malformed pick is dropped, not fatal
			}
		}
		const picks = items.slice(0, 3);
		if (!picks.length) return { started: false };

		const { id, body } = await ensureWeekly();
		const label = new Date().toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		// Re-planning mid-day shouldn't stack stamps — the log marks that the
		// day started, the setting holds whatever the plan currently is.
		if (!body.split('\n').some((l) => l.includes(label) && l.includes('day started'))) {
			const names = picks.map((p) => (p.kind === 'task' ? p.text : p.name)).join(', ');
			await api.update('notes', id, {
				body: appendLog(body, `- ${label} — day started · focus: ${names}`)
			});
		}
		await api.putSetting('day_focus', { date: todayISO(), items: picks });
		return { started: true };
	},
	// Begin a work session on the Now thread and go straight to it. The clock
	// lives server-side (a settings blob), so it keeps running while you're off
	// working — the overview shows it ticking when you come back.
	startSession: async ({ request }) => {
		const form = await request.formData();
		const label = form.get('label')?.toString().trim() || 'work';
		let href = form.get('href')?.toString() ?? '/';
		if (!href.startsWith('/')) href = '/';
		await api.putSetting('work_session', {
			started_at: new Date().toISOString(),
			label
		});
		redirect(303, href);
	},
	// Close the session: the elapsed time becomes a "## Log" line in the
	// weekly, and the clock clears.
	endSession: async () => {
		const s = (await api.getSetting('work_session')) as Partial<WorkSession> | null;
		if (!s?.started_at) return { ended: false };
		const mins = Math.round((Date.now() - Date.parse(s.started_at)) / 60000);
		if (Number.isFinite(mins)) {
			const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
			const { id, body } = await ensureWeekly();
			await api.update('notes', id, {
				body: appendLog(body, `- ${at} — ${fmtDur(Math.max(1, mins))} on ${s.label ?? 'work'}`)
			});
		}
		await api.deleteSetting('work_session');
		return { ended: true };
	},
	// Abandon a session without logging it — for the clock left running
	// overnight, where "9h on Logos" would just be noise.
	discardSession: async () => {
		await api.deleteSetting('work_session');
		return { discarded: true };
	},
	// Drop the day's plan so the ritual can be run again. The log stamp stays —
	// the day did start, the plan just changed.
	resetDay: async () => {
		await api.deleteSetting('day_focus');
		return { reset: true };
	},
	// Flip one "- [ ]" line in the weekly note, so checking something off
	// doesn't cost a page transition. The line index anchors the edit; the text
	// guards it — if the note changed underneath, the row is left alone and the
	// reload shows the current truth instead.
	toggle: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const line = Number(form.get('line'));
		const text = form.get('text')?.toString() ?? '';
		if (!id || !Number.isInteger(line) || line < 0) return { toggled: false };
		const note = await api.get('notes', id);
		const lines = String(note.body ?? '').split('\n');
		// Split on bare \n so the note's own line endings survive the round
		// trip: a \r\n body keeps its \r on every untouched line, and the one
		// edited line gets its own put back below.
		const raw = lines[line] ?? '';
		const cr = raw.endsWith('\r') ? '\r' : '';
		const m = /^(\s*[-*]\s*\[)([ xX])(\]\s*)(.+)$/.exec(cr ? raw.slice(0, -1) : raw);
		if (!m || m[4].trim() !== text) return { toggled: false };
		lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}${m[4]}${cr}`;
		await api.update('notes', id, { body: lines.join('\n') });
		// Keep the day's score. The note body can't date a checkmark, so the
		// week-task half of the header tally is counted here, where the check
		// happens. Same-day unchecks deduct; the floor keeps a stale uncheck
		// (yesterday's task) from going negative.
		const today = todayISO();
		const tally = (await api.getSetting('day_tally')) as {
			date?: string;
			week_tasks?: number;
		} | null;
		const base = tally?.date === today ? (tally.week_tasks ?? 0) : 0;
		await api.putSetting('day_tally', {
			date: today,
			week_tasks: Math.max(0, base + (m[2] === ' ' ? 1 : -1))
		});
		return { toggled: true };
	},
	// The suggestions panel's two verbs. Accept applies the row's action
	// server-side (app/assist.py); both stay on the page — the reload shows
	// the queue one shorter.
	assistAccept: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (id) await api.assistVerb(id, 'accept');
		return { done: true };
	},
	assistDismiss: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (id) await api.assistVerb(id, 'dismiss');
		return { done: true };
	},
	// Quick capture, routed: the text lands in the table its type names, right
	// now — "queued" would be a lie, so the row is simply created. The type
	// comes from the client's guess (regex over the text) unless a chip was
	// picked by hand; either way the server just honors it.
	capture: async ({ request }) => {
		const form = await request.formData();
		const title = form.get('title')?.toString().trim();
		if (!title) return { captured: false };
		const type = form.get('type')?.toString() ?? 'todo';
		if (type === 'note') {
			const made = await api.create('notes', { title, kind: 'note' });
			return { captured: true, type, href: `/notes/${made.id}` };
		}
		if (type === 'txn') {
			// "$40 strings" → amount 40. Captured spends default to expense —
			// income rarely arrives as a hurried thought.
			const amount = Number(/\$?(\d+(?:\.\d{1,2})?)/.exec(title)?.[1] ?? NaN);
			const made = await api.create('transactions', {
				name: title.replace(/\$?\d+(?:\.\d{1,2})?\s*/, '').trim() || title,
				kind: 'expense',
				...(Number.isFinite(amount) ? { amount } : {}),
				occurred_on: todayISO()
			});
			return { captured: true, type, href: `/transactions/${made.id}` };
		}
		if (type === 'event') {
			const made = await api.create('events', { title, kind: 'event' });
			return { captured: true, type, href: `/events/${made.id}` };
		}
		if (type === 'proj') {
			const made = await api.create('projects', { name: title, status: 'Not started' });
			return { captured: true, type, href: `/projects?open=${made.id}` };
		}
		const made = await api.create('todos', { title, status: 'Not started' });
		return { captured: true, type: 'todo', href: `/todos/${made.id}` };
	}
};
