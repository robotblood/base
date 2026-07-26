import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';

// One calendar over everything dated: events (starts_at), todos (due),
// projects (due), and notes (meeting_time). Each entry keeps enough to render
// and link back to its source record.
export interface CalEntry {
	id: string; // "<module>:<record id>" — unique across sources
	module: 'events' | 'todos' | 'projects' | 'notes';
	title: string;
	date: string; // YYYY-MM-DD
	time: string | null; // HH:MM when the source has a time of day
	detail: string; // location / status — the right-hand annotation
	done: boolean; // completed things render muted
	href: string;
}

const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const clock = (v: unknown) => {
	const s = v ? String(v) : '';
	return s.length >= 16 && s[10] === 'T' && s.slice(11, 16) !== '00:00' ? s.slice(11, 16) : null;
};

export const load: PageServerLoad = async () => {
	let entries: CalEntry[] = [];
	let apiError: string | null = null;
	try {
		const [events, todos, projects, notes] = await Promise.all([
			api.list('events'),
			api.list('todos'),
			api.list('projects'),
			api.list('notes')
		]);
		for (const e of events) {
			const date = day(e.starts_at);
			if (!date) continue;
			entries.push({
				id: `events:${e.id}`,
				module: 'events',
				title: String(e.title ?? ''),
				date,
				time: clock(e.starts_at),
				detail: String(e.location ?? e.kind ?? ''),
				done: e.status === 'Completed' || e.status === 'Cancelled',
				// Performances have the full show dashboard; other kinds the record page.
				href: e.kind === 'performance' ? `/shows/${e.id}` : `/events/${e.id}`
			});
		}
		for (const t of todos) {
			const date = day(t.due);
			if (!date) continue;
			entries.push({
				id: `todos:${t.id}`,
				module: 'todos',
				title: String(t.title ?? ''),
				date,
				time: null,
				detail: String(t.status ?? ''),
				done: t.status === 'Done',
				href: `/todos/${t.id}`
			});
		}
		for (const p of projects) {
			// The deadline the project actually works to — its own, or the one it
			// inherits from the project it hangs under (resolved by the API, see
			// app/inherit.py). A song with no date of its own still belongs on the
			// calendar on its album's date.
			const date = day(p.due_effective ?? p.due);
			if (!date) continue;
			const from = p.due_from ? ` · from ${p.due_from}` : '';
			entries.push({
				id: `projects:${p.id}`,
				module: 'projects',
				title: `${p.name} due`,
				date,
				time: null,
				detail: `${String(p.status ?? '')}${from}`,
				done: ['archived', 'Archive', 'Complete', 'Completed'].includes(String(p.status ?? '')),
				href: `/projects?open=${p.id}`
			});
		}
		for (const n of notes) {
			const date = day(n.meeting_time);
			if (!date) continue;
			entries.push({
				id: `notes:${n.id}`,
				module: 'notes',
				title: String(n.title ?? ''),
				date,
				time: clock(n.meeting_time),
				detail: String(n.meeting_type ?? n.kind ?? ''),
				done: n.status === 'Completed',
				href: `/notes/${n.id}`
			});
		}
		entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
	} catch (e) {
		apiError = e instanceof Error ? e.message : String(e);
	}
	return { entries, apiError };
};
