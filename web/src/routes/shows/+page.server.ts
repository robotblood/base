import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { ShowDoc } from '$lib/projects/data';

// The shows pipeline: every performance event, upcoming first, each opening
// the full show-details dashboard at /shows/[id]. Each row carries its show
// doc so the ledger can total the run's money without a second round trip.
export const load: PageServerLoad = async () => {
	let apiError: string | null = null;
	let shows: {
		id: number;
		title: string;
		when: string | null;
		location: string;
		status: string;
		project: string;
		projectId: number | null;
		show: ShowDoc | null;
	}[] = [];
	try {
		const [events, projects] = await Promise.all([api.list('events'), api.list('projects')]);
		const projName = new Map(projects.map((p) => [p.id, String(p.name ?? '')]));
		shows = events
			.filter((e) => e.kind === 'performance')
			.map((e) => ({
				id: e.id as number,
				title: String(e.title ?? ''),
				when: e.starts_at ? String(e.starts_at) : null,
				location: String(e.location ?? ''),
				status: String(e.status ?? ''),
				project: projName.get(e.project_id as number) ?? '',
				projectId: (e.project_id as number | null) ?? null,
				show: (e.show as ShowDoc | null) ?? null
			}))
			.sort((a, b) => String(b.when ?? '').localeCompare(String(a.when ?? '')));
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { shows, apiError };
};
