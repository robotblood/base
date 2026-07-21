import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { mapProject } from '$lib/projects/map';

// Loads every project plus all todos (project tasks are todos with a
// project_id) and ships them to the tracker in its own shape.
export const load: PageServerLoad = async () => {
	const [projects, todos] = await Promise.all([api.list('projects'), api.list('todos')]);
	return { projects: projects.map((r) => mapProject(r, todos)) };
};
