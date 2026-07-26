// Show Details dashboard — a performance event dressed as a command center
// (design handoff view 1c). Loads the event, its project (eyebrow, rundown
// link, show numbering) and the linked venue contact.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Item } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	let ev: Item;
	try {
		ev = await api.get('events', params.id);
	} catch {
		throw error(404, `No show #${params.id}`);
	}
	const pid = ev.project_id as number | null | undefined;
	const [project, siblings, contact] = await Promise.all([
		pid != null ? api.get('projects', pid).catch(() => null) : Promise.resolve(null),
		pid != null
			? api
					.list('events')
					.then((list) =>
						list.filter((e) => e.project_id === pid && e.kind === 'performance')
					)
					.catch(() => [] as Item[])
			: Promise.resolve([] as Item[]),
		ev.contact_id != null
			? api.get('people', ev.contact_id as number).catch(() => null)
			: Promise.resolve(null)
	]);
	// The People database as {id, name} options for the contact picker.
	const directory = await api
		.list('people')
		.then((rows) =>
			rows
				.map((r) => ({ id: String(r.id), name: String(r.name ?? `#${r.id}`) }))
				.sort((a, b) => a.name.localeCompare(b.name))
		)
		.catch(() => []);
	// Merch catalog for the count sheet's suggestions. Empty is the normal
	// starting state — counting a first show is how the catalog gets filled.
	const catalog = await api
		.list('merch')
		.then((rows) =>
			rows
				.map((r) => ({
					id: r.id as number,
					name: String(r.name ?? ''),
					price: Number(r.price ?? 0),
					stock: r.stock == null ? null : Number(r.stock)
				}))
				.sort((a, b) => a.name.localeCompare(b.name))
		)
		.catch(() => []);
	return { ev, project, siblings, contact, directory, catalog };
};
