// Interactive state for the Projects tracker. Initial data comes from the
// server load (real FastAPI rows shaped by `map.ts`); mutations apply
// optimistically to Svelte 5 `$state` and persist through `sync.ts`.
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { isoToday, type Project, type ProjFile, type Song } from './data';
import { emptyReady, kindInfo, presetPhases } from './kinds';
import { mapProject, toProjNote, toTask } from './map';
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

	// Rename or move a file inside the project folder (server keeps rundown
	// attachments pointing at it), then refresh the listing and the rundown.
	private async fileOp(pid: string, body: Record<string, string>) {
		try {
			const res = await fetch(`/projects/${pid}/fs`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
			const { rel } = (await res.json()) as { rel: string };
			// Mirror the server's rundown fix-up locally (it already persisted).
			const p = this.find(pid);
			const newName = rel.split('/').pop() ?? rel;
			for (const sec of p?.rundown?.sections ?? [])
				for (const song of sec.songs)
					for (const f of song.files)
						if (f.rel === body.p) {
							f.rel = rel;
							f.name = newName;
						}
			void this.loadFiles(pid, true);
		} catch (e) {
			toast.error('File operation failed', { description: String(e) });
		}
	}
	renameFile(pid: string, rel: string, newName: string) {
		return this.fileOp(pid, { p: rel, op: 'rename', to: newName });
	}
	moveFile(pid: string, rel: string, toDir: string) {
		return this.fileOp(pid, { p: rel, op: 'move', to: toDir });
	}
	async fileDirs(pid: string): Promise<string[]> {
		try {
			const res = await fetch(`/projects/${pid}/fs`);
			if (!res.ok) return [];
			return ((await res.json()) as { dirs: string[] }).dirs;
		} catch {
			return [];
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
	async addTask(pid: string, title: string, due = '') {
		const p = this.find(pid);
		if (!p || !title.trim()) return;
		const row = await persist.taskCreate({
			title: title.trim(),
			status: 'Not started',
			due: due || null,
			project_id: Number(pid)
		});
		if (row) p.tasks.push(toTask(row));
	}
	updateTask(pid: string, tid: string, patch: { title?: string; due?: string }) {
		const t = this.find(pid)?.tasks.find((x) => x.id === tid);
		if (!t) return;
		Object.assign(t, patch);
		void persist.task(tid, { ...patch, due: patch.due || null });
	}
	removeTask(pid: string, tid: string) {
		const p = this.find(pid);
		if (!p) return;
		p.tasks = p.tasks.filter((x) => x.id !== tid);
		void persist.taskDelete(tid);
	}

	// Phases / milestones / notes / people all live in the project's JSONB —
	// mutate in place, then persist the whole field.
	private saveField(pid: string, field: 'phases' | 'milestones' | 'people') {
		const p = this.find(pid);
		if (p) void persist.update(pid, { [field]: $state.snapshot(p[field]) });
	}
	addPhase(pid: string) {
		const p = this.find(pid);
		if (!p) return;
		p.phases.push({ name: 'New phase', status: 'todo' });
		this.saveField(pid, 'phases');
	}
	renamePhase(pid: string, i: number, name: string) {
		const ph = this.find(pid)?.phases[i];
		if (!ph || !name.trim() || ph.name === name.trim()) return;
		ph.name = name.trim();
		this.saveField(pid, 'phases');
	}
	cyclePhase(pid: string, i: number) {
		const ph = this.find(pid)?.phases[i];
		if (!ph) return;
		ph.status = ph.status === 'todo' ? 'active' : ph.status === 'active' ? 'done' : 'todo';
		this.saveField(pid, 'phases');
	}
	removePhase(pid: string, i: number) {
		const p = this.find(pid);
		if (!p) return;
		p.phases.splice(i, 1);
		this.saveField(pid, 'phases');
	}
	addMilestone(pid: string, name: string, date: string) {
		const p = this.find(pid);
		if (!p || !name.trim()) return;
		p.milestones.push({ name: name.trim(), date, done: false });
		p.milestones.sort((a, b) => (a.date < b.date ? -1 : 1));
		this.saveField(pid, 'milestones');
	}
	updateMilestone(pid: string, i: number, patch: { name?: string; date?: string }) {
		const m = this.find(pid)?.milestones[i];
		if (!m) return;
		Object.assign(m, patch);
		this.saveField(pid, 'milestones');
	}
	toggleMilestone(pid: string, i: number) {
		const p = this.find(pid);
		const m = p?.milestones[i];
		if (!p || !m) return;
		m.done = !m.done;
		if (m.done) this.logActivity(p, `Milestone "${m.name}" reached`);
		void persist.update(pid, {
			milestones: $state.snapshot(p.milestones),
			activity: $state.snapshot(p.activity)
		});
	}
	removeMilestone(pid: string, i: number) {
		const p = this.find(pid);
		if (!p) return;
		p.milestones.splice(i, 1);
		this.saveField(pid, 'milestones');
	}
	// Project notes are real Notes & Meetings records (notes.project_id).
	// Creating one takes you straight into its live editor.
	async addNote(pid: string, title: string) {
		const p = this.find(pid);
		if (!p || !title.trim()) return;
		const row = await persist.noteCreate({
			title: title.trim(),
			kind: 'note',
			project_id: Number(pid)
		});
		if (!row) return;
		p.notes.unshift(toProjNote(row));
		await goto(`/notes/${row.id}`);
	}
	removeNote(pid: string, i: number) {
		const p = this.find(pid);
		const n = p?.notes[i];
		if (!p || !n) return;
		p.notes.splice(i, 1);
		void persist.noteDelete(n.id);
	}
	addPerson(pid: string) {
		const p = this.find(pid);
		if (!p) return;
		p.people.push({ name: 'New person', role: 'role' });
		this.saveField(pid, 'people');
	}
	updatePerson(pid: string, i: number, patch: { name?: string; role?: string }) {
		const pe = this.find(pid)?.people[i];
		if (!pe) return;
		Object.assign(pe, patch);
		this.saveField(pid, 'people');
	}
	removePerson(pid: string, i: number) {
		const p = this.find(pid);
		if (!p) return;
		p.people.splice(i, 1);
		this.saveField(pid, 'people');
	}
	// Links (repo, deployed URL, design file, …) live in details.links.
	private saveDetails(pid: string) {
		const p = this.find(pid);
		if (p) void persist.update(pid, { details: $state.snapshot(p.details ?? {}) });
	}
	addLink(pid: string, label: string, url: string) {
		const p = this.find(pid);
		if (!p || !url.trim()) return;
		p.details = p.details ?? {};
		p.details.links = p.details.links ?? [];
		p.details.links.push({ label: label.trim() || url.trim(), url: url.trim() });
		this.saveDetails(pid);
	}
	updateLink(pid: string, i: number, patch: { label?: string; url?: string }) {
		const l = this.find(pid)?.details?.links?.[i];
		if (!l) return;
		Object.assign(l, patch);
		this.saveDetails(pid);
	}
	removeLink(pid: string, i: number) {
		const links = this.find(pid)?.details?.links;
		if (!links) return;
		links.splice(i, 1);
		this.saveDetails(pid);
	}
	// Print specs — a flat merge into details.print.
	setPrintSpec(pid: string, patch: Record<string, string>) {
		const p = this.find(pid);
		if (!p) return;
		p.details = p.details ?? {};
		p.details.print = { ...p.details.print, ...patch };
		this.saveDetails(pid);
	}
	// Video/motion deliverables checklist in details.deliverables.
	addDeliverable(pid: string, name: string, spec: string) {
		const p = this.find(pid);
		if (!p || !name.trim()) return;
		p.details = p.details ?? {};
		p.details.deliverables = p.details.deliverables ?? [];
		p.details.deliverables.push({ name: name.trim(), spec: spec.trim(), done: false });
		this.saveDetails(pid);
	}
	updateDeliverable(pid: string, i: number, patch: { name?: string; spec?: string }) {
		const d = this.find(pid)?.details?.deliverables?.[i];
		if (!d) return;
		Object.assign(d, patch);
		this.saveDetails(pid);
	}
	toggleDeliverable(pid: string, i: number) {
		const p = this.find(pid);
		const d = p?.details?.deliverables?.[i];
		if (!p || !d) return;
		d.done = !d.done;
		if (d.done) {
			const activity = this.logActivity(p, `Delivered "${d.name}"`);
			void persist.update(pid, {
				details: $state.snapshot(p.details ?? {}),
				activity
			});
			return;
		}
		this.saveDetails(pid);
	}
	removeDeliverable(pid: string, i: number) {
		const ds = this.find(pid)?.details?.deliverables;
		if (!ds) return;
		ds.splice(i, 1);
		this.saveDetails(pid);
	}
	rename(pid: string, name: string) {
		const p = this.find(pid);
		if (!p || !name.trim() || p.name === name.trim()) return;
		p.name = name.trim();
		void persist.update(pid, { name: p.name });
	}
	setSummary(pid: string, text: string) {
		const p = this.find(pid);
		if (!p || p.summary === text) return;
		p.summary = text;
		void persist.update(pid, { description: text });
	}

	// ---- umbrella linking (songs → album, sub-projects → rebuild, …) ---------
	childrenOf(pid: string): Project[] {
		return this.projects.filter((x) => x.parentId === pid);
	}
	linkParent(childId: string, parentId?: string) {
		const c = this.find(childId);
		if (!c || childId === parentId) return;
		c.parentId = parentId;
		void persist.update(childId, { parent_id: parentId ? Number(parentId) : null });
		const parent = parentId ? this.find(parentId) : undefined;
		if (parent) {
			const activity = this.logActivity(parent, `Linked "${c.name}"`);
			void persist.update(parentId!, { activity });
		}
	}
	async createChild(pid: string, name: string) {
		const p = this.find(pid);
		if (!p || !name.trim()) return;
		const kind = kindInfo(p.kind).childKind;
		const today = isoToday();
		const row = await persist.create({
			name: name.trim(),
			kind,
			year: today.slice(0, 4),
			status: 'Not Started',
			health: 'on-track',
			start: today,
			parent_id: Number(pid),
			phases: presetPhases(kind),
			activity: [{ date: today, text: 'Project created' }]
		});
		if (!row) return;
		this.projects.unshift(mapProject(row));
		const activity = this.logActivity(p, `Added "${name.trim()}"`);
		void persist.update(pid, { activity });
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
		const first = kindInfo(p.kind).family === 'music' ? 'SIDE A' : 'ACT I';
		p.rundown = { sections: [{ name: first, songs: [] }] };
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
	toggleReady(pid: string, sid: string, key: string) {
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
			ready: emptyReady(p.kind),
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
			phases: presetPhases(np.kind),
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
