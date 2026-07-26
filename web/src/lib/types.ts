// Shared types for the config-driven dashboard.

export type FieldType =
	| 'text'
	| 'textarea'
	| 'number'
	| 'date'
	| 'datetime'
	| 'select'
	| 'checkbox'
	| 'tags'
	| 'relation';

export interface FieldSpec {
	name: string;
	label: string;
	type: FieldType;
	options?: string[]; // for select
	ref?: string; // for relation: the module key this field links to
	required?: boolean;
	placeholder?: string;
}

// A pickable option for a relation field: another record's id + display label.
export interface RelationOption {
	id: number;
	label: string;
}

// How a module's records can be looked at. Every module gets 'table'; the rest
// are opt-in per module because they need fields not everything has (a board
// needs a groupable enum field, a calendar needs a date field).
export type ViewKind = 'table' | 'board' | 'group' | 'calendar';

// How a column's values compare when sorting. Inferred from the matching
// FieldSpec type when omitted (date/datetime -> date, number -> number).
export type SortKind = 'text' | 'number' | 'date';

export interface Column {
	header: string;
	field: string;
	render?: 'badge' | 'tags'; // default: plain text via fmt()
	sort?: SortKind; // override the inferred comparator
	hidden?: boolean; // start hidden in the column picker (still toggleable)
}

export interface ModuleConfig {
	key: string; // url segment + API endpoint + /stats key
	label: string; // plural display name
	singular: string; // used for "New <singular>"
	titleField: string; // 'title' | 'name'
	columns: Column[]; // list table
	fields: FieldSpec[]; // add / edit form

	// --- view configuration (all optional; a module with none is table-only) ---
	views?: ViewKind[]; // which views this module offers; defaults to ['table']
	groupFields?: string[]; // fields usable as the board/group axis
	dateField?: string; // drives the calendar and the date-bucket grouping
	// A date that is a *deadline*: past + not done means overdue. Distinct from
	// dateField — a meeting last March is in the past but was never "overdue",
	// so only modules with real deadlines set this.
	overdueField?: string;
	// The record's page content: a textarea field name that renders as a
	// formatted markdown document on the detail page (with a Write/Preview
	// toggle) and gets a quick-create input on the list page.
	docField?: string;
	statusField?: string; // default board axis; also what `doneValues` refers to
	doneValues?: string[]; // values treated as complete by the "hide done" toggle
	// Colour per value of `statusField`, from the STATE palette in status.ts.
	// Omit for modules whose status is free text with no fixed vocabulary.
	statusColors?: Record<string, string>;
	defaultSort?: { field: string; dir: SortDir };
}

export type SortDir = 'asc' | 'desc';

export type Item = Record<string, unknown> & { id: number };
export type Stats = Record<string, number>;

export interface TodoBrief {
	id: number;
	title: string;
	due: string | null;
	status: string | null;
	priority: string | null;
}
export interface EventBrief {
	id: number;
	title: string;
	starts_at: string | null;
	kind: string | null;
	location: string | null;
}
export interface NoteBrief {
	id: number;
	title: string;
	kind: string | null;
	updated_at: string | null;
	project_id: number | null;
}
export interface ProjectBrief {
	id: number;
	name: string;
	status: string | null;
}
// One upcoming performance inside a thread, with the advance state that says
// whether it still needs work.
export interface ThreadShow {
	id: number;
	title: string;
	starts_at: string | null;
	location: string | null;
	status: string | null;
	advance: string | null;
}
// A live project as the home screen sees it: what it is, what's next, what
// hangs off it, and (for live shows) the dates it's building toward.
export interface Thread {
	id: number;
	name: string;
	kind: string | null;
	status: string | null;
	health: string | null;
	due: string | null;
	next_action: string | null;
	counts: { tasks: number; notes: number; shows: number };
	shows: ThreadShow[];
	opens_at: string | null;
	unadvanced: number;
}
export interface DashboardData {
	today: string;
	threads: Thread[];
	recent_notes: NoteBrief[];
	loose: { overdue: TodoBrief[]; undated: number; open_total: number };
}
