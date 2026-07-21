// Persistence for tracker mutations. State updates optimistically in the
// Tracker; each mutation then relays through /projects/sync (the SvelteKit
// server → FastAPI). Failures surface as a toast so nothing is silently lost.
import { toast } from 'svelte-sonner';
import type { Row } from './map';

async function send(body: unknown): Promise<Row | null> {
	try {
		const res = await fetch('/projects/sync', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		return (await res.json()) as Row;
	} catch (e) {
		toast.error('Save failed — change is only local', { description: String(e) });
		return null;
	}
}

export const persist = {
	update: (id: string, patch: Row) => send({ op: 'update', id, patch }),
	create: (data: Row) => send({ op: 'create', data }),
	task: (id: string, patch: Row) => send({ op: 'task', id, patch }),
	taskCreate: (data: Row) => send({ op: 'task-create', data }),
	taskDelete: (id: string) => send({ op: 'task-delete', id }),
	noteCreate: (data: Row) => send({ op: 'note-create', data }),
	noteDelete: (id: string) => send({ op: 'note-delete', id }),
	eventCreate: (data: Row) => send({ op: 'event-create', data }),
	eventDelete: (id: string) => send({ op: 'event-delete', id })
};
