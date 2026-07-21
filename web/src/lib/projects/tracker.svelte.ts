// Interactive state for the Projects tracker prototype. All mutations here run
// against in-memory seed data (Phase 1). Svelte 5 `$state` gives deep
// reactivity, so in-place mutation of nested project data is tracked.
import { seed, type Project } from './data';

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
	projects = $state<Project[]>(seed());
	route = $state<Route>({ name: 'list' });
	listView = $state<ListView>('board');
	layout = $state<Layout>('console');
	query = $state('');
	newOpen = $state(false);
	np = $state<NewProjectDraft>({ name: '', kind: 'video', due: '' });
	wsTab = $state<WsTab>('overview');
	openSongs = $state<Record<string, boolean>>({});

	constructor(opts?: { defaultView?: string; defaultLayout?: string }) {
		if (opts?.defaultView && ['board', 'list', 'timeline'].includes(opts.defaultView))
			this.listView = opts.defaultView as ListView;
		if (opts?.defaultLayout && ['console', 'focus'].includes(opts.defaultLayout))
			this.layout = opts.defaultLayout as Layout;
	}

	find(id: string): Project | undefined {
		return this.projects.find((p) => p.id === id);
	}

	// ---- navigation ----------------------------------------------------------
	openProject(id: string) {
		this.route = { name: 'project', id };
		this.wsTab = 'overview';
	}
	goList = () => {
		this.route = { name: 'list' };
	};

	// ---- project mutations ---------------------------------------------------
	toggleTask(pid: string, tid: string) {
		const t = this.find(pid)?.tasks.find((x) => x.id === tid);
		if (t) t.done = !t.done;
	}
	setStatus(pid: string, key: string) {
		const p = this.find(pid);
		if (p) p.status = key;
	}
	advance(pid: string, nextKey: string) {
		this.setStatus(pid, nextKey);
	}

	// ---- rundown mutations ---------------------------------------------------
	toggleSong(id: string) {
		this.openSongs[id] = !this.openSongs[id];
	}
	toggleReady(pid: string, sid: string, key: 'files' | 'cues' | 'rehearsed') {
		const song = this.find(pid)
			?.rundown?.sections.flatMap((s) => s.songs)
			.find((s) => s.id === sid);
		if (song) song.ready[key] = !song.ready[key];
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
	}
	addPerformer(pid: string, sid: string) {
		const song = this.find(pid)
			?.rundown?.sections.flatMap((s) => s.songs)
			.find((s) => s.id === sid);
		if (song) song.performers.push({ name: 'New Performer', part: 'part' });
	}

	// ---- new project modal ---------------------------------------------------
	openNew = () => {
		this.newOpen = true;
	};
	closeNew = () => {
		this.newOpen = false;
	};
	createProject() {
		const np = this.np;
		if (!np.name.trim()) return;
		const id = 'p' + Date.now();
		const project: Project = {
			id,
			name: np.name.trim(),
			kind: np.kind,
			year: '2026',
			status: 'Not Started',
			health: 'on-track',
			start: '2026-07-18',
			due: np.due || '',
			summary: 'New project.',
			phases: [
				{ name: 'Scope', status: 'active' },
				{ name: 'Build', status: 'todo' },
				{ name: 'Ship', status: 'todo' }
			],
			tasks: [],
			milestones: [],
			notes: [],
			files: [],
			linked: [],
			people: [{ name: 'Cole Family', role: 'Owner' }],
			activity: [{ date: '2026-07-18', text: 'Project created' }]
		};
		this.projects.unshift(project);
		this.newOpen = false;
		this.np = { name: '', kind: 'video', due: '' };
		this.route = { name: 'project', id };
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
