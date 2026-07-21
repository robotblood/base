import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { mapProject } from '$lib/projects/map';

// Loads every project plus all todos (project tasks are todos with a
// project_id) and ships them to the tracker in its own shape. Query params
// deep-link into the stateful page: ?open=<id>, ?tab=rundown, ?new=1.
export const load: PageServerLoad = async ({ url }) => {
	const [projects, todos, notes] = await Promise.all([
		api.list('projects'),
		api.list('todos'),
		api.list('notes')
	]);
	return {
		projects: projects.map((r) => mapProject(r, todos, notes)),
		open: url.searchParams.get('open'),
		tab: url.searchParams.get('tab'),
		startNew: url.searchParams.get('new') === '1'
	};
};
