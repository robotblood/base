// Shapes FastAPI rows into the tracker's Project/Task types. Pure and
// framework-free, shared by the server load and client-side create flow.
import { STAGES, type Health, type Project, type Rundown, type Task } from './data';

export type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// Normalize whatever status text a row carries into the stage vocabulary —
// the Notion import wrote lower-case values like "archived".
export function toStageKey(status: unknown): string {
	const s = str(status).trim().toLowerCase();
	if (!s) return 'Not Started';
	for (const st of STAGES) if (st.key.toLowerCase() === s) return st.key;
	if (s === 'archived') return 'Archive';
	if (s === 'complete' || s === 'completed' || s === 'done') return 'Complete';
	if (s === 'in progress' || s === 'doing') return 'In Progress';
	return 'Not Started';
}

const DONE = new Set(['done', 'complete', 'completed']);

export function toTask(todo: Row): Task {
	return {
		id: String(todo.id),
		title: str(todo.title),
		done: DONE.has(str(todo.status).toLowerCase()),
		due: str(todo.due)
	};
}

export function mapProject(row: Row, todos: Row[] = []): Project {
	const id = String(row.id);
	const health = str(row.health);
	return {
		id,
		name: str(row.name),
		kind: str(row.kind) || 'project',
		year: str(row.year),
		status: toStageKey(row.status),
		health: (health === 'at-risk' || health === 'blocked' ? health : 'on-track') as Health,
		start: str(row.start),
		due: str(row.due),
		summary: str(row.description),
		source: str(row.source),
		path: str(row.path),
		parentId: row.parent_id != null ? String(row.parent_id) : undefined,
		phases: arr(row.phases),
		tasks: todos.filter((t) => String(t.project_id) === id).map(toTask),
		milestones: arr(row.milestones),
		notes: arr(row.journal),
		files: [],
		linked: arr(row.linked),
		people: arr(row.people),
		activity: arr(row.activity),
		rundown:
			row.rundown && typeof row.rundown === 'object' ? (row.rundown as Rundown) : undefined
	};
}
