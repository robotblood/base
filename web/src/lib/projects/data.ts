// Projects tracker — data model, seed data, and pure display helpers.
//
// PHASE 1 (prototype): this drives the redesigned /projects experience from the
// Claude Design handoff, using the mock's 12 seed projects. All logic here is
// pure and framework-free; interactive state lives in `tracker.svelte.ts`.
// PHASE 2 will replace `seed()` with real data from the FastAPI backend.

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
export interface ProjNote {
	date: string;
	title: string;
	body: string;
}
export interface ProjFile {
	name: string;
	meta: string;
}
export interface Linked {
	type: string;
	title: string;
	status: string;
}
export interface PersonRef {
	name: string;
	role: string;
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
	type: string; // playback | click | visuals | lighting | chart | track
	name: string;
}
export interface Resource {
	type: string; // link | doc | contact
	label: string;
}
export interface Ready {
	files: boolean;
	cues: boolean;
	rehearsed: boolean;
}
export interface Song {
	id: string;
	order: number;
	title: string;
	artist: string;
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
	year: string;
	status: string;
	health: Health;
	start: string;
	due: string;
	summary: string;
	phases: Phase[];
	tasks: Task[];
	milestones: Milestone[];
	notes: ProjNote[];
	files: ProjFile[];
	linked: Linked[];
	people: PersonRef[];
	activity: ActivityEntry[];
	rundown?: Rundown;
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

// "Today" is pinned to the mock's reference date so the seeded due labels
// ("due today", "in 2d", "3d overdue") match the design exactly. Phase 2 will
// use the real current date.
export const TODAY = new Date('2026-07-18T00:00:00');

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
	return 0;
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

export function initials(name: string): string {
	return name
		.split(' ')
		.map((x) => x[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

// File-type preview swatch: kind, accent color, and a deterministic waveform.
export type FileKind = 'audio' | 'video' | 'light' | 'image' | 'doc';
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
	doc: '#8a8478'
};
export function filePreview(name: string, hint?: string): FilePreview {
	const ext = (name.split('.').pop() || '').toLowerCase();
	let kind: FileKind;
	if (hint === 'playback' || hint === 'click' || hint === 'track') kind = 'audio';
	else if (hint === 'visuals') kind = 'video';
	else if (hint === 'lighting') kind = 'light';
	else if (hint === 'chart') kind = 'doc';
	else if (['wav', 'mp3', 'aif', 'aiff', 'aac', 'm4a'].indexOf(ext) >= 0) kind = 'audio';
	else if (['mov', 'mp4', 'mpg', 'mpeg', 'prproj', 'avi'].indexOf(ext) >= 0) kind = 'video';
	else if (['png', 'jpg', 'jpeg', 'gif', 'ai', 'psd'].indexOf(ext) >= 0) kind = 'image';
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
	track: { code: 'TRACK', color: '#3a6ea5' }
};
export const RES_ICON: Record<string, string> = { link: '↗', doc: '▤', contact: '◍' };
export const LINK_CODE_MAP: Record<string, { code: string; color: string }> = {
	todo: { code: 'TODO', color: '#c68a1a' },
	hw: { code: 'HW', color: '#3a6ea5' },
	sw: { code: 'SW', color: '#2f7d5b' },
	note: { code: 'NOTE', color: '#8a8478' }
};

export function seed(): Project[] {
	return [
		{
			id: 'p1',
			name: 'Robotblood — Fall Tour',
			kind: 'live show',
			year: '2026',
			status: 'Active',
			health: 'on-track',
			start: '2026-04-01',
			due: '2026-09-20',
			summary:
				'12-city live show. Stage, lighting and cue package plus nightly load-in checklist.',
			phases: [
				{ name: 'Pre-pro', status: 'done' },
				{ name: 'Rehearsal', status: 'done' },
				{ name: 'On tour', status: 'active' },
				{ name: 'Wrap', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Finalize stage plot', done: true, due: '2026-06-10' },
				{ id: 't2', title: 'Program lighting cues', done: true, due: '2026-06-28' },
				{ id: 't3', title: 'Restock merch for Denver', done: false, due: '2026-07-21' },
				{ id: 't4', title: 'Denver load-in checklist', done: false, due: '2026-07-24' },
				{ id: 't5', title: 'Update tour rider', done: false, due: '2026-08-02' },
				{ id: 't6', title: 'Soundcheck run sheet', done: true, due: '2026-06-30' }
			],
			milestones: [
				{ name: 'Production kickoff', date: '2026-04-05', done: true },
				{ name: 'Full rehearsals', date: '2026-06-20', done: true },
				{ name: 'Tour opens — Austin', date: '2026-07-05', done: true },
				{ name: 'Tour closes — Seattle', date: '2026-09-18', done: false }
			],
			notes: [
				{
					date: '2026-07-12',
					title: 'Production meeting',
					body: 'Locked the encore lighting change. Merch counts running low for the western leg — reorder before Denver.'
				},
				{
					date: '2026-07-02',
					title: 'Promoter call',
					body: 'Two shows moved to larger rooms; rider needs a second monitor engineer.'
				}
			],
			files: [
				{ name: 'stage_plot_v4.pdf', meta: '1.2 MB' },
				{ name: 'cue_sheet.xlsx', meta: '340 KB' },
				{ name: 'tour_deck.key', meta: '88 MB' }
			],
			linked: [
				{ type: 'hw', title: 'Stage lighting rig', status: 'in progress' },
				{ type: 'sw', title: 'Resolume license', status: 'submitted' },
				{ type: 'todo', title: 'Confirm Denver hotel block', status: 'draft' }
			],
			people: [
				{ name: 'Cole Family', role: 'Director' },
				{ name: 'Sam Reyes', role: 'Tour mgr' },
				{ name: 'Ava Lin', role: 'LD' }
			],
			activity: [
				{ date: '2026-07-14', text: 'Marked "Soundcheck run sheet" complete' },
				{ date: '2026-07-12', text: 'Added note from production meeting' },
				{ date: '2026-07-05', text: 'Milestone "Tour opens" reached' },
				{ date: '2026-06-28', text: 'Status moved to Active' }
			],
			rundown: {
				sections: [
					{
						name: 'ACT I — OPENING',
						songs: [
							{
								id: 'r1',
								order: 1,
								title: 'Cold Open',
								artist: 'intro · instrumental',
								dur: 135,
								key: '',
								bpm: 0,
								performers: [{ name: 'Ava Lin', part: 'Drums / pads' }],
								files: [
									{ type: 'playback', name: 'coldopen_stems.wav' },
									{ type: 'visuals', name: 'intro_loop.mov' },
									{ type: 'lighting', name: 'scene_01_blackout.xml' }
								],
								resources: [{ type: 'doc', label: 'Intro run sheet' }],
								ready: { files: true, cues: true, rehearsed: true },
								notes: 'Hold blackout until first downbeat.'
							},
							{
								id: 'r2',
								order: 2,
								title: 'Robotblood',
								artist: '',
								dur: 228,
								key: 'A min',
								bpm: 128,
								performers: [
									{ name: 'Cole Family', part: 'Vocals / Guitar' },
									{ name: 'Sam Reyes', part: 'Bass' },
									{ name: 'Ava Lin', part: 'Drums' }
								],
								files: [
									{ type: 'playback', name: 'robotblood_backing.wav' },
									{ type: 'click', name: 'robotblood_click.wav' },
									{ type: 'visuals', name: 'rb_titles.mov' }
								],
								resources: [
									{ type: 'link', label: 'Reference mix' },
									{ type: 'doc', label: 'Chord chart.pdf' }
								],
								ready: { files: true, cues: true, rehearsed: false },
								notes: ''
							},
							{
								id: 'r3',
								order: 3,
								title: 'Ghost Machine',
								artist: '',
								dur: 201,
								key: 'E min',
								bpm: 120,
								performers: [
									{ name: 'Cole Family', part: 'Vocals' },
									{ name: 'Sam Reyes', part: 'Synth bass' }
								],
								files: [
									{ type: 'playback', name: 'ghost_backing.wav' },
									{ type: 'lighting', name: 'scene_03_strobe.xml' }
								],
								resources: [{ type: 'link', label: 'Demo v3' }],
								ready: { files: true, cues: false, rehearsed: false },
								notes: ''
							}
						]
					},
					{
						name: 'ACT II — CORE',
						songs: [
							{
								id: 'r4',
								order: 4,
								title: 'Low Signal',
								artist: '',
								dur: 245,
								key: 'C min',
								bpm: 110,
								performers: [
									{ name: 'Cole Family', part: 'Vocals / Guitar' },
									{ name: 'Ava Lin', part: 'Drums' }
								],
								files: [
									{ type: 'playback', name: 'lowsignal_backing.wav' },
									{ type: 'click', name: 'lowsignal_click.wav' }
								],
								resources: [{ type: 'doc', label: 'Lyric sheet.pdf' }],
								ready: { files: false, cues: false, rehearsed: false },
								notes: 'Needs backing-vocal stem from the mix session.'
							},
							{
								id: 'r5',
								order: 5,
								title: 'Parallel',
								artist: 'feat. Nia Okoro',
								dur: 262,
								key: 'G min',
								bpm: 124,
								performers: [
									{ name: 'Cole Family', part: 'Vocals' },
									{ name: 'Nia Okoro', part: 'Guest vocals' },
									{ name: 'Sam Reyes', part: 'Bass' }
								],
								files: [
									{ type: 'playback', name: 'parallel_backing.wav' },
									{ type: 'visuals', name: 'parallel_visuals.mov' },
									{ type: 'lighting', name: 'scene_05_warm.xml' }
								],
								resources: [
									{ type: 'contact', label: 'Nia Okoro — mgmt' },
									{ type: 'link', label: 'Guest vox reference' }
								],
								ready: { files: true, cues: true, rehearsed: false },
								notes: 'Confirm Nia mic + IEM before soundcheck.'
							},
							{
								id: 'r6',
								order: 6,
								title: 'Hollow',
								artist: '',
								dur: 198,
								key: 'D min',
								bpm: 96,
								performers: [{ name: 'Cole Family', part: 'Vocals / Guitar' }],
								files: [{ type: 'playback', name: 'hollow_backing.wav' }],
								resources: [{ type: 'doc', label: 'Chord chart.pdf' }],
								ready: { files: true, cues: true, rehearsed: true },
								notes: ''
							}
						]
					},
					{
						name: 'ENCORE',
						songs: [
							{
								id: 'r7',
								order: 7,
								title: 'Afterglow',
								artist: '',
								dur: 284,
								key: 'A maj',
								bpm: 118,
								performers: [
									{ name: 'Cole Family', part: 'Vocals / Guitar' },
									{ name: 'Sam Reyes', part: 'Bass' },
									{ name: 'Ava Lin', part: 'Drums' },
									{ name: 'Nia Okoro', part: 'Guest vocals' }
								],
								files: [
									{ type: 'playback', name: 'afterglow_backing.wav' },
									{ type: 'visuals', name: 'afterglow_finale.mov' },
									{ type: 'lighting', name: 'scene_07_finale.xml' },
									{ type: 'click', name: 'afterglow_click.wav' }
								],
								resources: [
									{ type: 'link', label: 'Finale reference' },
									{ type: 'doc', label: 'Confetti cue timing.pdf' }
								],
								ready: { files: true, cues: false, rehearsed: false },
								notes: 'Confetti + house lights on the final chord.'
							}
						]
					}
				]
			}
		},
		{
			id: 'p2',
			name: 'Planet',
			kind: 'video',
			year: '2026',
			status: 'In Progress',
			health: 'at-risk',
			start: '2026-05-01',
			due: '2026-08-12',
			summary: 'Feature-length edit. Picture lock targeted before color and sound handoff.',
			phases: [
				{ name: 'Assembly', status: 'done' },
				{ name: 'Fine cut', status: 'active' },
				{ name: 'Color', status: 'todo' },
				{ name: 'Deliver', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Assembly edit', done: true, due: '2026-06-01' },
				{ id: 't2', title: 'Fine cut act 2', done: true, due: '2026-07-01' },
				{ id: 't3', title: 'Fine cut act 3', done: false, due: '2026-07-22' },
				{ id: 't4', title: 'Temp sound pass', done: false, due: '2026-07-30' },
				{ id: 't5', title: 'Picture lock', done: false, due: '2026-08-05' }
			],
			milestones: [
				{ name: 'Assembly done', date: '2026-06-01', done: true },
				{ name: 'Picture lock', date: '2026-08-05', done: false },
				{ name: 'Delivery', date: '2026-08-12', done: false }
			],
			notes: [
				{
					date: '2026-07-10',
					title: 'Edit review',
					body: 'Act 3 pacing still slow. Trim the middle sequence by ~90s before lock.'
				}
			],
			files: [
				{ name: 'planet_finecut_v7.prproj', meta: '2.1 GB' },
				{ name: 'notes_review.txt', meta: '12 KB' }
			],
			linked: [
				{ type: 'sw', title: 'DaVinci Resolve Studio', status: 'submitted' },
				{ type: 'todo', title: 'Book color suite', status: 'draft' }
			],
			people: [
				{ name: 'Cole Family', role: 'Editor' },
				{ name: 'Nia Okoro', role: 'Colorist' }
			],
			activity: [
				{ date: '2026-07-10', text: 'Added edit review note' },
				{ date: '2026-07-01', text: 'Completed fine cut act 2' },
				{ date: '2026-06-01', text: 'Milestone "Assembly done" reached' }
			]
		},
		{
			id: 'p3',
			name: 'Cosmosapien',
			kind: 'video',
			year: '2026',
			status: 'In Progress',
			health: 'on-track',
			start: '2026-06-10',
			due: '2026-10-05',
			summary: 'Music-driven short. Shooting wrapped, moving into edit and VFX.',
			phases: [
				{ name: 'Shoot', status: 'done' },
				{ name: 'Edit', status: 'active' },
				{ name: 'VFX', status: 'todo' },
				{ name: 'Final', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Ingest & backup footage', done: true, due: '2026-06-20' },
				{ id: 't2', title: 'Select circles', done: true, due: '2026-07-05' },
				{ id: 't3', title: 'Rough cut', done: false, due: '2026-08-01' },
				{ id: 't4', title: 'VFX shot list', done: false, due: '2026-08-15' }
			],
			milestones: [
				{ name: 'Wrap shoot', date: '2026-06-18', done: true },
				{ name: 'Rough cut', date: '2026-08-01', done: false },
				{ name: 'Final delivery', date: '2026-10-05', done: false }
			],
			notes: [
				{
					date: '2026-06-19',
					title: 'Post kickoff',
					body: 'Two hero VFX shots need a compositor. Everything else is in-house.'
				}
			],
			files: [{ name: 'cosmo_selects.mov', meta: '640 MB' }],
			linked: [{ type: 'hw', title: 'Render workstation', status: 'in progress' }],
			people: [{ name: 'Cole Family', role: 'Director' }],
			activity: [
				{ date: '2026-07-05', text: 'Completed select circles' },
				{ date: '2026-06-18', text: 'Milestone "Wrap shoot" reached' }
			]
		},
		{
			id: 'p4',
			name: 'Neuroplastic Odyssey',
			kind: 'video',
			year: '2026',
			status: 'Needs Attention',
			health: 'blocked',
			start: '2026-03-15',
			due: '2026-07-25',
			summary: 'Long-form piece blocked on a licensing question before final export.',
			phases: [
				{ name: 'Edit', status: 'done' },
				{ name: 'Clear rights', status: 'active' },
				{ name: 'Export', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Final edit', done: true, due: '2026-06-30' },
				{ id: 't2', title: 'Clear archival footage rights', done: false, due: '2026-07-15' },
				{ id: 't3', title: 'Master export', done: false, due: '2026-07-24' }
			],
			milestones: [
				{ name: 'Edit locked', date: '2026-06-30', done: true },
				{ name: 'Rights cleared', date: '2026-07-15', done: false },
				{ name: 'Delivery', date: '2026-07-25', done: false }
			],
			notes: [
				{
					date: '2026-07-08',
					title: 'Legal follow-up',
					body: 'Still waiting on the archive house to confirm the 1998 clip license. This is holding the whole delivery.'
				}
			],
			files: [
				{ name: 'odyssey_master.mov', meta: '487 MB' },
				{ name: 'rights_request.pdf', meta: '220 KB' }
			],
			linked: [
				{ type: 'todo', title: 'Chase archive house license', status: 'submitted' },
				{ type: 'note', title: 'Licensing thread', status: 'open' }
			],
			people: [{ name: 'Cole Family', role: 'Producer' }],
			activity: [
				{ date: '2026-07-08', text: 'Flagged Needs Attention — licensing block' },
				{ date: '2026-06-30', text: 'Milestone "Edit locked" reached' }
			]
		},
		{
			id: 'p5',
			name: 'Old Baby',
			kind: 'video',
			year: '2026',
			status: 'Not Started',
			health: 'on-track',
			start: '2026-08-01',
			due: '2026-12-01',
			summary: 'Documentary short — scoping and pre-production not yet begun.',
			phases: [
				{ name: 'Scope', status: 'todo' },
				{ name: 'Shoot', status: 'todo' },
				{ name: 'Post', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Write treatment', done: false, due: '2026-08-10' },
				{ id: 't2', title: 'Location scout', done: false, due: '2026-08-25' }
			],
			milestones: [
				{ name: 'Treatment approved', date: '2026-08-15', done: false },
				{ name: 'Shoot begins', date: '2026-09-10', done: false }
			],
			notes: [],
			files: [],
			linked: [{ type: 'todo', title: 'Draft treatment outline', status: 'draft' }],
			people: [{ name: 'Cole Family', role: 'Director' }],
			activity: [{ date: '2026-07-16', text: 'Project created' }]
		},
		{
			id: 'p6',
			name: 'Low Gloss',
			kind: 'video',
			year: '2026',
			status: 'In Progress',
			health: 'on-track',
			start: '2026-06-20',
			due: '2026-09-01',
			summary: 'Brand film across four vignettes. Two shot, two remaining.',
			phases: [
				{ name: 'Shoot', status: 'active' },
				{ name: 'Edit', status: 'todo' },
				{ name: 'Deliver', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Vignette 1 shoot', done: true, due: '2026-07-01' },
				{ id: 't2', title: 'Vignette 2 shoot', done: true, due: '2026-07-14' },
				{ id: 't3', title: 'Vignette 3 shoot', done: false, due: '2026-08-04' },
				{ id: 't4', title: 'Assembly', done: false, due: '2026-08-20' }
			],
			milestones: [
				{ name: 'Half of shoot done', date: '2026-07-14', done: true },
				{ name: 'Final delivery', date: '2026-09-01', done: false }
			],
			notes: [
				{
					date: '2026-07-14',
					title: 'Client check-in',
					body: 'They love vignette 2. Push saturation down slightly for the set.'
				}
			],
			files: [{ name: 'lowgloss_v2.mov', meta: '134 MB' }],
			linked: [{ type: 'sw', title: 'Frame.io seats', status: 'submitted' }],
			people: [
				{ name: 'Cole Family', role: 'DP' },
				{ name: 'Rae Kim', role: 'Producer' }
			],
			activity: [{ date: '2026-07-14', text: 'Completed vignette 2 shoot' }]
		},
		{
			id: 'p7',
			name: 'Merica',
			kind: 'video',
			year: '2026',
			status: 'Complete',
			health: 'on-track',
			start: '2026-02-01',
			due: '2026-06-30',
			summary: 'Delivered short. Final master and captions shipped to client.',
			phases: [
				{ name: 'Edit', status: 'done' },
				{ name: 'Finish', status: 'done' },
				{ name: 'Deliver', status: 'done' }
			],
			tasks: [
				{ id: 't1', title: 'Final edit', done: true, due: '2026-05-10' },
				{ id: 't2', title: 'Color & sound', done: true, due: '2026-06-05' },
				{ id: 't3', title: 'Deliver master + captions', done: true, due: '2026-06-28' }
			],
			milestones: [
				{ name: 'Picture lock', date: '2026-05-10', done: true },
				{ name: 'Delivered', date: '2026-06-28', done: true }
			],
			notes: [
				{ date: '2026-06-28', title: 'Wrap', body: 'Client signed off. Archive the project folder.' }
			],
			files: [{ name: 'merica_master_final.mov', meta: '260 MB' }],
			linked: [],
			people: [{ name: 'Cole Family', role: 'Editor' }],
			activity: [
				{ date: '2026-06-28', text: 'Marked Complete' },
				{ date: '2026-06-05', text: 'Completed color & sound' }
			]
		},
		{
			id: 'p8',
			name: 'Park States — Live Set',
			kind: 'music',
			year: '2026',
			status: 'Active',
			health: 'at-risk',
			start: '2026-05-15',
			due: '2026-11-10',
			summary: 'Recurring live music set. Currently touring; rotating setlist and visuals.',
			phases: [
				{ name: 'Build set', status: 'done' },
				{ name: 'Touring', status: 'active' },
				{ name: 'Rest', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Program visuals', done: true, due: '2026-06-01' },
				{ id: 't2', title: 'Rehearse new setlist', done: true, due: '2026-06-20' },
				{ id: 't3', title: 'Fix wireless dropouts', done: false, due: '2026-07-19' },
				{ id: 't4', title: 'Book fall dates', done: false, due: '2026-08-10' }
			],
			milestones: [
				{ name: 'First show', date: '2026-06-05', done: true },
				{ name: 'Fall leg', date: '2026-09-15', done: false }
			],
			notes: [
				{
					date: '2026-07-11',
					title: 'Show debrief',
					body: 'Wireless pack dropped twice mid-set. Swap to the backup system before next date.'
				}
			],
			files: [
				{ name: 'setlist_summer.pdf', meta: '40 KB' },
				{ name: 'visuals_pack.zip', meta: '4.0 GB' }
			],
			linked: [
				{ type: 'hw', title: 'Wireless IEM system', status: 'in progress' },
				{ type: 'todo', title: 'Confirm fall venues', status: 'draft' }
			],
			people: [
				{ name: 'Cole Family', role: 'Artist' },
				{ name: 'Sam Reyes', role: 'FOH' }
			],
			activity: [
				{ date: '2026-07-11', text: 'Added show debrief note' },
				{ date: '2026-06-05', text: 'Milestone "First show" reached' }
			],
			rundown: {
				sections: [
					{
						name: 'SET A',
						songs: [
							{
								id: 'k1',
								order: 1,
								title: 'Overture',
								artist: 'instrumental',
								dur: 180,
								key: 'F maj',
								bpm: 100,
								performers: [{ name: 'Cole Family', part: 'Keys' }],
								files: [
									{ type: 'playback', name: 'overture_pad.wav' },
									{ type: 'visuals', name: 'overture_vis.mov' }
								],
								resources: [{ type: 'doc', label: 'Set A run sheet.pdf' }],
								ready: { files: true, cues: true, rehearsed: true },
								notes: ''
							},
							{
								id: 'k2',
								order: 2,
								title: 'Park States',
								artist: '',
								dur: 240,
								key: 'D maj',
								bpm: 112,
								performers: [
									{ name: 'Cole Family', part: 'Vocals / Keys' },
									{ name: 'Sam Reyes', part: 'Bass' }
								],
								files: [
									{ type: 'playback', name: 'parkstates_backing.wav' },
									{ type: 'click', name: 'parkstates_click.wav' }
								],
								resources: [{ type: 'link', label: 'Reference mix' }],
								ready: { files: true, cues: false, rehearsed: true },
								notes: ''
							}
						]
					},
					{
						name: 'SET B',
						songs: [
							{
								id: 'k3',
								order: 3,
								title: 'Wireless',
								artist: '',
								dur: 210,
								key: 'B min',
								bpm: 128,
								performers: [
									{ name: 'Cole Family', part: 'Vocals' },
									{ name: 'Sam Reyes', part: 'Bass' }
								],
								files: [{ type: 'playback', name: 'wireless_backing.wav' }],
								resources: [{ type: 'doc', label: 'Lyric sheet.pdf' }],
								ready: { files: false, cues: false, rehearsed: false },
								notes: 'Swap to backup wireless pack — dropouts last show.'
							},
							{
								id: 'k4',
								order: 4,
								title: 'Closer',
								artist: '',
								dur: 300,
								key: 'A maj',
								bpm: 120,
								performers: [
									{ name: 'Cole Family', part: 'Vocals / Keys' },
									{ name: 'Sam Reyes', part: 'Bass' }
								],
								files: [
									{ type: 'playback', name: 'closer_backing.wav' },
									{ type: 'lighting', name: 'scene_closer.xml' }
								],
								resources: [{ type: 'link', label: 'Finale reference' }],
								ready: { files: true, cues: true, rehearsed: false },
								notes: ''
							}
						]
					}
				]
			}
		},
		{
			id: 'p9',
			name: 'Live Video',
			kind: 'video',
			year: '2026',
			status: 'Needs Attention',
			health: 'at-risk',
			start: '2026-06-01',
			due: '2026-07-20',
			summary: 'Multicam capture of a live event. Edit due imminently, media still syncing.',
			phases: [
				{ name: 'Capture', status: 'done' },
				{ name: 'Sync', status: 'active' },
				{ name: 'Edit', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Offload all cameras', done: true, due: '2026-06-10' },
				{ id: 't2', title: 'Multicam sync', done: false, due: '2026-07-16' },
				{ id: 't3', title: 'Cut main set', done: false, due: '2026-07-19' }
			],
			milestones: [
				{ name: 'Media synced', date: '2026-07-16', done: false },
				{ name: 'Delivery', date: '2026-07-20', done: false }
			],
			notes: [
				{
					date: '2026-07-13',
					title: 'Sync issue',
					body: 'Camera C timecode drifted. May need manual sync — tight against the deadline.'
				}
			],
			files: [{ name: 'live_multicam.prproj', meta: '109 GB' }],
			linked: [{ type: 'todo', title: 'Manual-sync camera C', status: 'submitted' }],
			people: [{ name: 'Cole Family', role: 'Editor' }],
			activity: [{ date: '2026-07-13', text: 'Flagged Needs Attention — sync drift' }]
		},
		{
			id: 'p10',
			name: 'Mountain Hand',
			kind: 'design',
			year: '2026',
			status: 'In Progress',
			health: 'on-track',
			start: '2026-07-05',
			due: '2026-10-20',
			summary: 'Design system + key art for an upcoming release. Exploration phase.',
			phases: [
				{ name: 'Explore', status: 'active' },
				{ name: 'Refine', status: 'todo' },
				{ name: 'Handoff', status: 'todo' }
			],
			tasks: [
				{ id: 't1', title: 'Moodboard', done: true, due: '2026-07-12' },
				{ id: 't2', title: 'Three key-art directions', done: false, due: '2026-08-01' },
				{ id: 't3', title: 'Type + color system', done: false, due: '2026-08-20' }
			],
			milestones: [
				{ name: 'Direction chosen', date: '2026-08-05', done: false },
				{ name: 'System handoff', date: '2026-10-15', done: false }
			],
			notes: [
				{
					date: '2026-07-10',
					title: 'Kickoff',
					body: 'Leaning warm/analog. Avoid the obvious tech look.'
				}
			],
			files: [{ name: 'moodboard.png', meta: '8 MB' }],
			linked: [{ type: 'sw', title: 'Figma team seat', status: 'submitted' }],
			people: [{ name: 'Cole Family', role: 'Designer' }],
			activity: [{ date: '2026-07-12', text: 'Completed moodboard' }]
		},
		{
			id: 'p11',
			name: 'Elite Chat',
			kind: 'design',
			year: '2026',
			status: 'Not Started',
			health: 'on-track',
			start: '2026-08-15',
			due: '2026-11-30',
			summary: 'Product identity refresh. Queued behind current work.',
			phases: [
				{ name: 'Scope', status: 'todo' },
				{ name: 'Design', status: 'todo' },
				{ name: 'Ship', status: 'todo' }
			],
			tasks: [{ id: 't1', title: 'Audit current brand', done: false, due: '2026-08-20' }],
			milestones: [{ name: 'Scope locked', date: '2026-08-25', done: false }],
			notes: [],
			files: [],
			linked: [],
			people: [{ name: 'Cole Family', role: 'Designer' }],
			activity: [{ date: '2026-07-15', text: 'Project created' }]
		},
		{
			id: 'p12',
			name: 'Jessica Animations',
			kind: 'mixed',
			year: '2026',
			status: 'Archive',
			health: 'on-track',
			start: '2026-01-10',
			due: '2026-05-20',
			summary: 'Completed and archived. 30 animated segments delivered.',
			phases: [
				{ name: 'Animate', status: 'done' },
				{ name: 'Deliver', status: 'done' }
			],
			tasks: [
				{ id: 't1', title: 'Animate segments', done: true, due: '2026-04-01' },
				{ id: 't2', title: 'Deliver + archive', done: true, due: '2026-05-18' }
			],
			milestones: [
				{ name: 'All segments done', date: '2026-04-30', done: true },
				{ name: 'Archived', date: '2026-05-20', done: true }
			],
			notes: [],
			files: [{ name: 'jessica_final.zip', meta: '560 MB' }],
			linked: [],
			people: [{ name: 'Cole Family', role: 'Animator' }],
			activity: [{ date: '2026-05-20', text: 'Moved to Archive' }]
		}
	];
}
