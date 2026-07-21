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
	try {
		dashboard = await api.dashboard();
		// Most recently updated project with a rundown — the "New song" target.
		const projects = await api.list('projects');
		const shows = projects
			.filter((p) => p.rundown)
			.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
		if (shows.length) latestShow = { id: shows[0].id as number, name: String(shows[0].name) };
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { dashboard, apiError, latestShow, weekOf: mondayISO() };
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
