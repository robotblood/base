import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { DashboardData } from '$lib/types';

// Monday of the current week, as YYYY-MM-DD — one weekly note per week.
function mondayISO(): string {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
// surfaced on the Overview as this week's task list.
function parseTasks(body: string): { text: string; done: boolean }[] {
	const out: { text: string; done: boolean }[] = [];
	for (const line of body.split('\n')) {
		const m = /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/.exec(line);
		if (m) out.push({ text: m[2].trim(), done: m[1] !== ' ' });
	}
	return out;
}

export const load: PageServerLoad = async () => {
	let dashboard: DashboardData | null = null;
	let apiError: string | null = null;
	let latestShow: { id: number; name: string } | null = null;
	let weekNote: { id: number; tasks: { text: string; done: boolean }[] } | null = null;
	try {
		// Threads, recent notes and loose ends all come from /dashboard now; the
		// only things left to resolve here are the two quick-action targets.
		dashboard = await api.dashboard();
		const weeklyTitle = `Weekly — ${mondayISO()}`;
		const [projects, weekly] = await Promise.all([
			api.list('projects'),
			api.list('notes', weeklyTitle)
		]);
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
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { dashboard, apiError, latestShow, weekNote, weekOf: mondayISO() };
};

export const actions: Actions = {
	// Open this week's note, creating it from the template the first time.
	weekly: async () => {
		const title = `Weekly — ${mondayISO()}`;
		const found = (await api.list('notes', title)).find((n) => n.title === title);
		const id =
			found?.id ??
			(await api.create('notes', { title, kind: 'weekly', body: WEEKLY_TEMPLATE })).id;
		redirect(303, `/notes/${id}`);
	},
	// Quick capture: a bare todo, straight into the inbox, stay on the page.
	capture: async ({ request }) => {
		const title = (await request.formData()).get('title')?.toString().trim();
		if (title) await api.create('todos', { title, status: 'Not started' });
		return { captured: true };
	}
};
