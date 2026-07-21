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

const WEEKLY_TEMPLATE = `## Focus
-

## Log
-

## Parking lot
-
`;

export const load: PageServerLoad = async () => {
	let dashboard: DashboardData | null = null;
	let apiError: string | null = null;
	let latestShow: { id: number; name: string } | null = null;
	let shows: { id: number; title: string; when: string; location: string; projectId: number | null }[] =
		[];
	try {
		dashboard = await api.dashboard();
		const [projects, events] = await Promise.all([api.list('projects'), api.list('events')]);
		// Most recently updated project with a rundown — the "New song" target.
		const withRundown = projects
			.filter((p) => p.rundown)
			.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
		if (withRundown.length)
			latestShow = { id: withRundown[0].id as number, name: String(withRundown[0].name) };
		// Upcoming performances — the shows you're actually playing.
		const now = new Date().toISOString();
		shows = events
			.filter((e) => e.kind === 'performance' && String(e.starts_at ?? '') >= now)
			.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
			.slice(0, 8)
			.map((e) => ({
				id: e.id as number,
				title: String(e.title),
				when: String(e.starts_at),
				location: String(e.location ?? ''),
				projectId: (e.project_id as number | null) ?? null
			}));
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { dashboard, apiError, latestShow, shows, weekOf: mondayISO() };
};

export const actions: Actions = {
	// Open this week's note, creating it from the template the first time.
	weekly: async () => {
		const title = `Weekly — ${mondayISO()}`;
		const found = (await api.list('notes', title)).find((n) => n.title === title);
		const id =
			found?.id ??
			(await api.create('notes', { title, kind: 'journal', body: WEEKLY_TEMPLATE })).id;
		redirect(303, `/notes/${id}`);
	},
	// Quick capture: a bare todo, straight into the inbox, stay on the page.
	capture: async ({ request }) => {
		const title = (await request.formData()).get('title')?.toString().trim();
		if (title) await api.create('todos', { title, status: 'Not started' });
		return { captured: true };
	}
};
