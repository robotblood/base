// Projects tracker — data model and pure display helpers.
//
// Drives the redesigned /projects experience (Claude Design handoff). All
// logic here is pure and framework-free; interactive state lives in
// `tracker.svelte.ts`, and rows from the FastAPI backend are shaped into
// these types by `map.ts`.

export type Health = 'on-track' | 'at-risk' | 'blocked';
export type PhaseStatus = 'done' | 'active' | 'todo';

export interface Task {
	id: string;
	title: string;
	done: boolean;
	due: string;
}
export interface Phase {
	name: string;
	status: PhaseStatus;
}
export interface Milestone {
	name: string;
	date: string;
	done: boolean;
}
// A real Notes & Meetings record linked to the project (notes.project_id).
export interface ProjNote {
	id: string;
	date: string;
	title: string;
	body: string;
	kind: string; // note | meeting | journal
}
// The show production doc stored whole in events.show (performances only).
export interface ShowDoc {
	advance?: string; // Advanced | Pending | Confirmed
	doors?: string;
	set?: string;
	loadIn?: string;
	loadOut?: string;
	capacity?: number;
	sold?: number;
	gross?: number; // dollars
	contactRole?: string;
	timeline?: { t: string; l: string; done?: boolean; head?: boolean }[];
	crew?: { name: string; role: string }[];
	setlist?: string;
	tickets?: { tier: string; price: string; sold: string }[];
	guests?: { name: string; type: string }[];
	guestCount?: string; // e.g. "18 / 25"
	// Free-form settlement lines from before terms were modelled. Still
	// rendered when `deal` is unset, so older shows keep what was typed.
	settlement?: { label: string; value: string }[];
	deal?: Deal;
	merch?: MerchCount[];
	// ISO stamp written when sold counts were pushed into merch.stock, so the
	// same show can't be applied to inventory twice.
	merchApplied?: string;
}
// Deal terms — enough to settle a normal club/theatre show. The artist takes
// whichever is larger: the guarantee, or `split`% of net after expenses.
export interface Deal {
	guarantee?: number; // dollars
	split?: number; // percent of net box office, 0–100
	expenses?: { label: string; amount: number }[];
	merchRate?: number; // percent of merch gross the venue keeps, 0–100
}
// One merch line for one show. `out` is the count at the end of the night, so
// sold = in - out - comp and the sheet reconciles against physical stock.
export interface MerchCount {
	itemId?: number; // merch table record, when the line came from the catalog
	name: string;
	price: number;
	in: number;
	out?: number;
	comp?: number;
}
// A real Calendar event linked to the project (events.project_id).
export interface ProjEvent {
	id: string;
	title: string;
	when: string; // ISO datetime (may be empty)
	location: string;
	address: string;
	phone: string;
	email: string;
	contactId?: string; // People database record
	notes: string;
	kind: string; // event | performance | deadline | …
	status: string; // show pipeline: Announced | Advancing | Confirmed | …
	show?: ShowDoc;
}
export interface ProjFile {
	name: string;
	meta: string;
	rel?: string; // path relative to the project folder (real, on-disk files)
	kind?: string; // image | video | audio | other (from the files endpoint)
	mtime?: number; // unix ms — lets the hero pick the newest file
}
// A file's place in the project's lifecycle. Archived files leave the cards
// (and the hero) but stay one toggle away — status, not deletion.
export type FileStatus = 'draft' | 'final' | 'archived';
export interface Linked {
	type: string;
	title: string;
	status: string;
}
// A Merch module row linked to this project (inventory kind). The Merch
// record stays the source of truth; the project is the tour-facing view.
export interface MerchRow {
	id: string;
	name: string;
	category: string;
	sku: string;
	price?: number;
	cost?: number;
	stock: number;
	lowAt?: number; // merch.low_stock_at
	url?: string;
}
export interface PersonRef {
	personId?: string; // People database record; name mirrors it when linked
	name: string;
	role: string; // per-project role, lives with the project
}
export interface ActivityEntry {
	date: string;
	text: string;
}
export interface Performer {
	name: string;
	part: string;
}
export interface SongFile {
	type: string; // playback | click | visuals | lighting | chart | track | model
	name: string;
	rel?: string; // path within the project folder (real, on-disk file)
}
export interface Resource {
	type: string; // link | doc | contact
	label: string;
}
// Keys come from the kind's ready-flags (live: files/cues/rehearsed,
// music: tracked/mixed/mastered — see kinds.ts).
export type Ready = Record<string, boolean>;
export interface Song {
	id: string;
	order: number;
	title: string;
	artist: string;
	projectId?: string; // this track's own project (usually a child of this one)
	dur: number; // seconds
	key: string;
	bpm: number;
	performers: Performer[];
	files: SongFile[];
	resources: Resource[];
	ready: Ready;
	notes: string;
}
export interface Section {
	name: string;
	songs: Song[];
}
export interface Rundown {
	sections: Section[];
}
export interface Project {
	id: string;
	name: string;
	kind: string;
	subkind?: string; // emphasis within the kind (logo | stinger | tour | …)
	year: string;
	status: string;
	health: Health;
	start: string;
	due: string;
	summary: string;
	source?: string; // where the record came from (import source)
	path?: string; // on-disk folder root — enables real file previews
	rawPath?: string; // folder recorded by the importer, weaker than `path`
	parentId?: string; // umbrella project (e.g. a song's album)
	details?: ProjectDetails; // kind-specific extras
	phases: Phase[];
	tasks: Task[];
	milestones: Milestone[];
	notes: ProjNote[];
	events: ProjEvent[];
	merch: MerchRow[];
	files: ProjFile[];
	linked: Linked[];
	people: PersonRef[];
	activity: ActivityEntry[];
	rundown?: Rundown;
}

// Kind-specific extras, stored whole in the details JSONB column.
export interface PrintSpecs {
	size?: string; // e.g. 18×24 in
	bleed?: string; // e.g. 0.125 in
	color?: string; // CMYK | RGB | PMS …
	stock?: string;
	qty?: string;
	vendor?: string;
	proofDue?: string; // ISO date
}
export interface Deliverable {
	name: string; // e.g. Master, Vertical cut, Thumbnail
	spec: string; // e.g. 16:9 · 4K · ProRes 422
	done: boolean;
}
export interface ProjectDetails {
	links?: { label: string; url: string }[];
	print?: PrintSpecs;
	deliverables?: Deliverable[];
	cover?: string; // pinned hero file (rel path); unset = newest file wins
	fileStatus?: Record<string, FileStatus>; // keyed by file rel path
}

export interface Stage {
	key: string;
	code: string;
	color: string;
}

// The project pipeline. Colors are semantic data colors (status dots / bars) —
// they read on both the Paper (light) and Console (dark) surfaces, like charts.
export const STAGES: Stage[] = [
	{ key: 'Not Started', code: 'NS', color: '#b0aa9c' },
	{ key: 'In Progress', code: 'IP', color: '#c68a1a' },
	{ key: 'Needs Attention', code: 'NA', color: '#b23a26' },
	{ key: 'Active', code: 'AC', color: '#2f7d5b' },
	{ key: 'Complete', code: 'CP', color: '#3a6ea5' },
	{ key: 'Archive', code: 'AR', color: '#8a8478' }
];

// Today at local midnight — due-date math works in whole days.
const _now = new Date();
export const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());

export function isoToday(): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${TODAY.getFullYear()}-${p(TODAY.getMonth() + 1)}-${p(TODAY.getDate())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmt(d: Date): string {
	return MONTHS[d.getMonth()] + ' ' + d.getDate();
}
export function fmtISO(iso: string): string {
	return fmt(new Date(iso + 'T00:00:00'));
}

export interface DueInfo {
	label: string;
	color: string;
}
export function dueInfo(iso: string, status: string): DueInfo {
	if (!iso) return { label: '—', color: '#a8a296' };
	const d = new Date(iso + 'T00:00:00');
	const diff = Math.round((d.getTime() - TODAY.getTime()) / 86400000);
	if (status === 'Complete' || status === 'Archive') return { label: fmt(d), color: '#a8a296' };
	if (diff < 0) return { label: -diff + 'd overdue', color: '#b23a26' };
	if (diff === 0) return { label: 'due today', color: '#b23a26' };
	if (diff <= 7) return { label: 'in ' + diff + 'd', color: '#c68a1a' };
	if (diff <= 21) return { label: 'in ' + diff + 'd', color: '#6f6a5e' };
	return { label: fmt(d), color: '#6f6a5e' };
}

export function progress(p: Project): number {
	const t = p.tasks || [];
	if (t.length) return Math.round((t.filter((x) => x.done).length / t.length) * 100);
	const ph = p.phases || [];
	if (ph.length) return Math.round((ph.filter((x) => x.status === 'done').length / ph.length) * 100);
	// No tasks or phases (e.g. archive imports): finished states read as 100%.
	return p.status === 'Complete' || p.status === 'Archive' ? 100 : 0;
}

export interface HealthVM {
	color: string;
	label: string;
}
export function healthVM(h: Health): HealthVM {
	if (h === 'blocked') return { color: '#b23a26', label: 'Blocked' };
	if (h === 'at-risk') return { color: '#c68a1a', label: 'At risk' };
	return { color: '#2f7d5b', label: 'On track' };
}

export function stageOf(status: string): Stage {
	return STAGES.find((x) => x.key === status) ?? STAGES[0];
}
export function nextStage(status: string): Stage {
	const idx = STAGES.findIndex((x) => x.key === status);
	return STAGES[Math.min(idx + 1, STAGES.length - 1)];
}
export function phaseColor(status: PhaseStatus): string {
	return status === 'done' ? '#2f7d5b' : status === 'active' ? '#c68a1a' : '#cfc9bb';
}
export function phaseFill(status: PhaseStatus): number {
	return status === 'done' ? 100 : status === 'active' ? 55 : 0;
}

export function fmtDur(sec: number): string {
	const m = Math.floor(sec / 60),
		s = sec % 60;
	return m + ':' + String(s).padStart(2, '0');
}

// Accepts "3:45" or plain seconds ("225") — the inverse of fmtDur for inputs.
export function parseDur(v: string): number {
	const m = /^(\d+):([0-5]?\d)$/.exec(v.trim());
	if (m) return +m[1] * 60 + +m[2];
	const n = parseInt(v, 10);
	return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function initials(name: string): string {
	return name
		.split(' ')
		.map((x) => x[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

// File-type preview swatch: kind, accent color, and a deterministic waveform.
export type FileKind = 'audio' | 'video' | 'light' | 'image' | 'model' | 'doc';
export interface FilePreview {
	ext: string;
	color: string;
	bars: number[];
	kind: FileKind;
}
const FILE_COLORS: Record<FileKind, string> = {
	audio: '#3a6ea5',
	video: '#1b1917',
	light: '#b23a26',
	image: '#2f7d5b',
	model: '#7d5ba6',
	doc: '#8a8478'
};
export function filePreview(name: string, hint?: string): FilePreview {
	const ext = (name.split('.').pop() || '').toLowerCase();
	let kind: FileKind;
	if (hint === 'playback' || hint === 'click' || hint === 'track') kind = 'audio';
	else if (hint === 'visuals') kind = 'video';
	else if (hint === 'lighting') kind = 'light';
	else if (hint === 'chart') kind = 'doc';
	else if (hint === 'model') kind = 'model';
	else if (['wav', 'mp3', 'aif', 'aiff', 'aac', 'm4a'].indexOf(ext) >= 0) kind = 'audio';
	else if (['mov', 'mp4', 'mpg', 'mpeg', 'prproj', 'avi'].indexOf(ext) >= 0) kind = 'video';
	else if (['png', 'jpg', 'jpeg', 'gif', 'ai', 'psd'].indexOf(ext) >= 0) kind = 'image';
	else if (['blend', 'fbx', 'obj', 'glb', 'gltf', 'c4d', 'ma', 'mb', 'stl', 'usd', 'usdz'].indexOf(ext) >= 0)
		kind = 'model';
	else kind = 'doc';
	let seed = 0;
	for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
	const bars: number[] = [];
	for (let i = 0; i < 9; i++) {
		seed = (seed * 1103515245 + 12345) >>> 0;
		bars.push(28 + (seed % 68));
	}
	return { ext: ext ? ext.toUpperCase() : 'FILE', color: FILE_COLORS[kind], bars, kind };
}

// Code + color for a song's file (rundown) and for a linked cross-module item.
export const SONG_FILE_MAP: Record<string, { code: string; color: string }> = {
	playback: { code: 'PLAY', color: '#3a6ea5' },
	click: { code: 'CLICK', color: '#c68a1a' },
	visuals: { code: 'VIS', color: '#2f7d5b' },
	lighting: { code: 'LIGHT', color: '#b23a26' },
	chart: { code: 'CHART', color: '#8a8478' },
	track: { code: 'TRACK', color: '#3a6ea5' },
	model: { code: '3D', color: '#7d5ba6' }
};
export const RES_ICON: Record<string, string> = { link: '↗', doc: '▤', contact: '◍' };
export const LINK_CODE_MAP: Record<string, { code: string; color: string }> = {
	todo: { code: 'TODO', color: '#c68a1a' },
	hw: { code: 'HW', color: '#3a6ea5' },
	sw: { code: 'SW', color: '#2f7d5b' },
	note: { code: 'NOTE', color: '#8a8478' }
};

