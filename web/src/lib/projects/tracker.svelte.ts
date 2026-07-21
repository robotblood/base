// Interactive state for the Projects tracker. Initial data comes from the
// server load (real FastAPI rows shaped by `map.ts`); mutations apply
// optimistically to Svelte 5 `$state` and persist through `sync.ts`.
import { toast } from 'svelte-sonner';
import { isoToday, type Project, type ProjFile, type Song } from './data';
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
		this.startWatch(id);
	}
	goList = () => {
		this.route = { name: 'list' };
		this.stopWatch();
	};

	// ---- real on-disk files --------------------------------------------------
	// Open a file (or the project folder, with no rel) in its native app, or
	// reveal it in the file manager. Runs on the machine hosting the app.
	async openLocal(pid: string, rel?: string, mode: 'open' | 'reveal' = 'open') {
		try {
			const res = await fetch(`/projects/${pid}/open`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ p: rel ?? '', mode })
			});
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		} catch (e) {
			toast.error('Could not open', { description: String(e) });
		}
	}

	async loadFiles(id: string, force = false) {
		const p = this.find(id);
		if (!p || !p.path || (this.filesLoaded[id] && !force)) return;
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
			// Bump the cache-buster so thumbs of edited files refetch (the
			// server thumb cache is keyed by mtime; the browser's isn't).
			if (force) this.fileVer[id] = (this.fileVer[id] ?? 0) + 1;
		} catch {
			this.filesLoaded[id] = false;
		}
	}

	// ---- folder watching (SSE) -----------------------------------------------
	// While a project is open, the server watches its folder and pushes
	// "changed" events; the file list and thumbs refresh themselves.
	fileVer = $state<Record<string, number>>({});
	watching = $state(false);
	private es: EventSource | null = null;
	private startWatch(id: string) {
		this.stopWatch();
		const p = this.find(id);
		if (!p?.path || typeof EventSource === 'undefined') return;
		const es = new EventSource(`/projects/${id}/watch`);
		this.es = es;
		es.onmessage = (ev) => {
			if (ev.data === 'watching') this.watching = true;
			else if (ev.data === 'changed') void this.loadFiles(id, true);
		};
		// Server gone or drive unmounted — stop rather than auto-reconnect
		// forever; a manual refresh or reopening the project retries.
		es.onerror = () => {
			if (this.es === es) this.stopWatch();
		};
	}
	stopWatch() {
		this.es?.close();
		this.es = null;
		this.watching = false;
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
	private findSong(pid: string, sid: string) {
		return this.find(pid)
			?.rundown?.sections.flatMap((s) => s.songs)
			.find((s) => s.id === sid);
	}
	// Keep the printed song numbers sequential across sections.
	private renumber(pid: string) {
		let n = 0;
		for (const sec of this.find(pid)?.rundown?.sections ?? [])
			for (const s of sec.songs) s.order = ++n;
	}
	createRundown(pid: string) {
		const p = this.find(pid);
		if (!p || p.rundown) return;
		p.rundown = { sections: [{ name: 'ACT I', songs: [] }] };
		this.wsTab = 'rundown';
		this.saveRundown(pid);
	}
	addSection(pid: string) {
		const r = this.find(pid)?.rundown;
		if (!r) return;
		r.sections.push({ name: `SECTION ${r.sections.length + 1}`, songs: [] });
		this.saveRundown(pid);
	}
	renameSection(pid: string, si: number, name: string) {
		const sec = this.find(pid)?.rundown?.sections[si];
		if (!sec || !name.trim() || sec.name === name.trim()) return;
		sec.name = name.trim();
		this.saveRundown(pid);
	}
	removeSection(pid: string, si: number) {
		const r = this.find(pid)?.rundown;
		if (!r || r.sections[si]?.songs.length) return; // only empty sections
		r.sections.splice(si, 1);
		this.saveRundown(pid);
	}
	updateSong(pid: string, sid: string, patch: Partial<Song>) {
		const song = this.findSong(pid, sid);
		if (!song) return;
		Object.assign(song, patch);
		this.saveRundown(pid);
	}
	removeSong(pid: string, sid: string) {
		for (const sec of this.find(pid)?.rundown?.sections ?? []) {
			const i = sec.songs.findIndex((s) => s.id === sid);
			if (i >= 0) {
				sec.songs.splice(i, 1);
				this.renumber(pid);
				this.saveRundown(pid);
				return;
			}
		}
	}
	attachSongFile(pid: string, sid: string, file: { type: string; name: string; rel?: string }) {
		const song = this.findSong(pid, sid);
		if (!song) return;
		song.files.push(file);
		this.saveRundown(pid);
	}
	removeSongFile(pid: string, sid: string, index: number) {
		const song = this.findSong(pid, sid);
		if (!song) return;
		song.files.splice(index, 1);
		this.saveRundown(pid);
	}
	updatePerformer(pid: string, sid: string, index: number, patch: { name?: string; part?: string }) {
		const pf = this.findSong(pid, sid)?.performers[index];
		if (!pf) return;
		Object.assign(pf, patch);
		this.saveRundown(pid);
	}
	removePerformer(pid: string, sid: string, index: number) {
		const song = this.findSong(pid, sid);
		if (!song) return;
		song.performers.splice(index, 1);
		this.saveRundown(pid);
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
		this.renumber(pid);
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

	// ---- folder picker -------------------------------------------------------
	picker = $state<{ pid: string } | null>(null);
	openPicker(pid: string) {
		this.picker = { pid };
	}
	closePicker = () => {
		this.picker = null;
	};
	async setPath(pid: string, path: string) {
		const p = this.find(pid);
		if (!p) return;
		p.path = path;
		p.files = [];
		this.filesLoaded[pid] = false;
		this.picker = null;
		const activity = this.logActivity(p, `Linked folder ${path}`);
		await persist.update(pid, { path, activity });
		void this.loadFiles(pid);
		this.startWatch(pid);
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
