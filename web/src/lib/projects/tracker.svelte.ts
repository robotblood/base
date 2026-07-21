// Interactive state for the Projects tracker. Initial data comes from the
// server load (real FastAPI rows shaped by `map.ts`); mutations apply
// optimistically to Svelte 5 `$state` and persist through `sync.ts`.
import { isoToday, type Project, type ProjFile } from './data';
import { mapProject } from './map';
import { persist } from './sync';

export type ListView = 'board' | 'list' | 'timeline';
export type Layout = 'console' | 'focus';
export type WsTab = 'overview' | 'rundown';
export type Route = { name: 'list' } | { name: 'project'; id: string };
export interface NewProjectDraft {
	name: string;
	kind: string;
	due: string;
}

export class Tracker {
	projects = $state<Project[]>([]);
	route = $state<Route>({ name: 'list' });
	listView = $state<ListView>('board');
	layout = $state<Layout>('console');
	query = $state('');
	newOpen = $state(false);
	np = $state<NewProjectDraft>({ name: '', kind: 'video', due: '' });
	wsTab = $state<WsTab>('overview');
	openSongs = $state<Record<string, boolean>>({});
	filesLoaded = $state<Record<string, boolean>>({});

	constructor(initial: Project[], opts?: { defaultView?: string; defaultLayout?: string }) {
		this.projects = initial;
		if (opts?.defaultView && ['board', 'list', 'timeline'].includes(opts.defaultView))
			this.listView = opts.defaultView as ListView;
		if (opts?.defaultLayout && ['console', 'focus'].includes(opts.defaultLayout))
			this.layout = opts.defaultLayout as Layout;
	}

	find(id: string): Project | undefined {
		return this.projects.find((p) => p.id === id);
	}

	// Prepend an activity entry and return a plain snapshot for persisting.
	private logActivity(p: Project, text: string) {
		p.activity.unshift({ date: isoToday(), text });
		return $state.snapshot(p.activity);
	}

	// ---- navigation ----------------------------------------------------------
	openProject(id: string) {
		this.route = { name: 'project', id };
		this.wsTab = 'overview';
		void this.loadFiles(id);
	}
	goList = () => {
		this.route = { name: 'list' };
	};

	// ---- real on-disk files --------------------------------------------------
	async loadFiles(id: string) {
		const p = this.find(id);
		if (!p || !p.path || this.filesLoaded[id]) return;
		this.filesLoaded[id] = true;
		try {
			const res = await fetch(`/projects/${id}/files`);
			if (!res.ok) return;
			const { items } = (await res.json()) as {
				items: { rel: string; name: string; kind: string; seq?: boolean; count?: number }[];
			};
			p.files = items.map(
				(it): ProjFile => ({
					name: it.name,
					rel: it.rel,
					kind: it.kind,
					meta: it.seq ? `sequence · ${it.count} frames` : it.kind
				})
			);
		} catch {
			this.filesLoaded[id] = false;
		}
	}

	// ---- project mutations ---------------------------------------------------
	toggleTask(pid: string, tid: string) {
		const t = this.find(pid)?.tasks.find((x) => x.id === tid);
		if (!t) return;
		t.done = !t.done;
		void persist.task(tid, { status: t.done ? 'Done' : 'Not started' });
	}
	setStatus(pid: string, key: string) {
		const p = this.find(pid);
		if (!p || p.status === key) return;
		p.status = key;
		const activity = this.logActivity(p, `Status moved to ${key}`);
		void persist.update(pid, { status: key, activity });
	}
	advance(pid: string, nextKey: string) {
		this.setStatus(pid, nextKey);
	}

	// ---- rundown mutations ---------------------------------------------------
	private saveRundown(pid: string) {
		const p = this.find(pid);
		if (p?.rundown) void persist.update(pid, { rundown: $state.snapshot(p.rundown) });
	}
	toggleSong(id: string) {
		this.openSongs[id] = !this.openSongs[id];
	}
	toggleReady(pid: string, sid: string, key: 'files' | 'cues' | 'rehearsed') {
		const song = this.find(pid)
			?.rundown?.sections.flatMap((s) => s.songs)
			.find((s) => s.id === sid);
		if (!song) return;
		song.ready[key] = !song.ready[key];
		this.saveRundown(pid);
	}
	addSong(pid: string, sectionIndex: number) {
		const p = this.find(pid);
		if (!p?.rundown) return;
		const total = p.rundown.sections.reduce((a, x) => a + x.songs.length, 0);
		p.rundown.sections[sectionIndex].songs.push({
			id: 'sg' + Date.now(),
			order: total + 1,
			title: 'New song',
			artist: '',
			dur: 210,
			key: '',
			bpm: 0,
			performers: [],
			files: [],
			resources: [],
			ready: { files: false, cues: false, rehearsed: false },
			notes: ''
		});
		this.saveRundown(pid);
	}
	addPerformer(pid: string, sid: string) {
		const song = this.find(pid)
			?.rundown?.sections.flatMap((s) => s.songs)
			.find((s) => s.id === sid);
		if (!song) return;
		song.performers.push({ name: 'New Performer', part: 'part' });
		this.saveRundown(pid);
	}

	// ---- new project modal ---------------------------------------------------
	openNew = () => {
		this.newOpen = true;
	};
	closeNew = () => {
		this.newOpen = false;
	};
	async createProject() {
		const np = this.np;
		if (!np.name.trim()) return;
		const today = isoToday();
		const row = await persist.create({
			name: np.name.trim(),
			kind: np.kind,
			year: today.slice(0, 4),
			status: 'Not Started',
			health: 'on-track',
			start: today,
			due: np.due || null,
			phases: [
				{ name: 'Scope', status: 'active' },
				{ name: 'Build', status: 'todo' },
				{ name: 'Ship', status: 'todo' }
			],
			activity: [{ date: today, text: 'Project created' }]
		});
		if (!row) return; // save failed — toast already shown
		const project = mapProject(row);
		this.projects.unshift(project);
		this.newOpen = false;
		this.np = { name: '', kind: 'video', due: '' };
		this.route = { name: 'project', id: project.id };
	}

	// ---- derived views -------------------------------------------------------
	get activeCount(): number {
		return this.projects.filter((p) => p.status !== 'Archive').length;
	}
	get filtered(): Project[] {
		const q = this.query.trim().toLowerCase();
		if (!q) return this.projects;
		return this.projects.filter(
			(p) => p.name.toLowerCase().includes(q) || (p.kind || '').toLowerCase().includes(q)
		);
	}
	get current(): Project | undefined {
		return this.route.name === 'project' ? this.find(this.route.id) : undefined;
	}
}
