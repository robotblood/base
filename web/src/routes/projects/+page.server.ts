import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { mapProject } from '$lib/projects/map';

// Loads every project plus all todos (project tasks are todos with a
// project_id) and ships them to the tracker in its own shape. Query params
// deep-link into the stateful page: ?open=<id>, ?tab=rundown, ?new=1.
export const load: PageServerLoad = async ({ url }) => {
	const [projects, todos, notes, events, people, merch] = await Promise.all([
		api.list('projects'),
		api.list('todos'),
		api.list('notes'),
		api.list('events'),
		api.list('people'),
		api.list('merch')
	]);
	return {
		projects: projects.map((r) => mapProject(r, todos, notes, events, merch)),
		directory: people.map((pe) => ({ id: String(pe.id), name: String(pe.name ?? '') })),
		// Merch rows not claimed by any project — the inventory card's
		// "link existing" pool.
		merchPool: merch
			.filter((m) => m.project_id == null)
			.map((m) => ({ id: String(m.id), name: String(m.name ?? ''), stock: Number(m.stock ?? 0) })),
		open: url.searchParams.get('open'),
		tab: url.searchParams.get('tab'),
		startNew: url.searchParams.get('new') === '1'
	};
};
