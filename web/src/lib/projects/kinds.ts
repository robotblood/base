// The canonical project kinds: 12 kinds in 4 layout families over one shared
// spine. A kind decides the phase preset a project is born with, which
// ready-flags its rundown/tracklist songs carry, what the rundown tab is
// called, and how the detail page orders its cards (see ProjectDetailView).
import type { Phase } from './data';

export type Family = 'visual' | 'software' | 'music' | 'live' | 'default';

export interface ReadyFlag {
	key: string;
	label: string;
	color: string;
}

export interface KindInfo {
	key: string; // stored in projects.kind
	label: string;
	family: Family;
	phases: string[]; // preset seeded at creation
	ready: ReadyFlag[]; // per-song flags in the rundown/tracklist
	rundownLabel: string; // tab name
	umbrellaLabel: string; // children card name
	childKind: string; // default kind for created children
}

const READY_LIVE: ReadyFlag[] = [
	{ key: 'files', label: 'Files', color: '#3a6ea5' },
	{ key: 'cues', label: 'Cues', color: '#c68a1a' },
	{ key: 'rehearsed', label: 'Rehearsed', color: '#2f7d5b' }
];
const READY_MUSIC: ReadyFlag[] = [
	{ key: 'tracked', label: 'Tracked', color: '#3a6ea5' },
	{ key: 'mixed', label: 'Mixed', color: '#c68a1a' },
	{ key: 'mastered', label: 'Mastered', color: '#2f7d5b' }
];

const K = (
	key: string,
	label: string,
	family: Family,
	phases: string[],
	extra: Partial<KindInfo> = {}
): KindInfo => ({
	key,
	label,
	family,
	phases,
	ready: family === 'music' ? READY_MUSIC : READY_LIVE,
	rundownLabel: family === 'music' ? 'Tracklist' : 'Show Rundown',
	umbrellaLabel: 'Sub-projects',
	childKind: 'music',
	...extra
});

export const KINDS: KindInfo[] = [
	K('graphics', 'Graphics', 'visual', ['Brief', 'Concepts', 'Revisions', 'Final']),
	K('motion graphics', 'Motion Graphics', 'visual', ['Brief', 'Style frames', 'Animate', 'Polish', 'Deliver']),
	K('3d', '3D', 'visual', ['Reference', 'Model', 'Texture', 'Light', 'Render']),
	K('print', 'Print', 'visual', ['Design', 'Proof', 'Print', 'Delivered']),
	K('video', 'Video', 'visual', ['Script', 'Board', 'Shoot', 'Edit', 'Color', 'Deliver']),
	K('music', 'Music', 'music', ['Writing', 'Demo', 'Tracking', 'Mix', 'Master']),
	K('album', 'Music Album', 'music', ['Writing', 'Tracking', 'Mix', 'Master', 'Release'], {
		umbrellaLabel: 'Tracks'
	}),
	K('app dev', 'App Development', 'software', ['Scope', 'Design', 'Build', 'Test', 'Ship']),
	K('ui/ux', 'UI/UX', 'software', ['Research', 'Wireframe', 'Design', 'Handoff']),
	K('tech audit', 'Tech Stack Audit', 'software', ['Inventory', 'Assess', 'Findings', 'Plan']),
	K('rebuild', 'Rebuild', 'software', ['Audit', 'Plan', 'Build', 'Migrate', 'Verify'], {
		umbrellaLabel: 'Workstreams'
	}),
	K('live show', 'Live Show', 'live', ['Pre-pro', 'Rehearsal', 'Show', 'Wrap'], {
		umbrellaLabel: 'Segments',
		childKind: 'video'
	})
];

// Freeform kinds from the Notion import (and older records) → canonical keys.
const ALIASES: Record<string, string> = {
	design: 'graphics',
	photo: 'graphics',
	motion: 'motion graphics',
	film: 'video',
	software: 'app dev',
	website: 'app dev',
	audit: 'tech audit',
	'live-show': 'live show',
	show: 'live show'
};

const FALLBACK: KindInfo = K('project', 'Project', 'default', ['Scope', 'Build', 'Ship']);

export function kindInfo(kind: string | undefined): KindInfo {
	const k = (kind ?? '').trim().toLowerCase();
	const key = ALIASES[k] ?? k;
	return KINDS.find((x) => x.key === key) ?? FALLBACK;
}

export function presetPhases(kind: string): Phase[] {
	return kindInfo(kind).phases.map((name, i) => ({ name, status: i === 0 ? 'active' : 'todo' }));
}

// Fresh ready map for a new song under this kind's flags.
export function emptyReady(kind: string): Record<string, boolean> {
	return Object.fromEntries(kindInfo(kind).ready.map((r) => [r.key, false]));
}
