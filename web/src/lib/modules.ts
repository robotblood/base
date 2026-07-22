// The single source of truth for the web dashboard's modules.
//
// Mirrors the backend: `app/main.py` MODULES (endpoint + title field) and
// `app/models.py` (the editable columns). To surface a new module, register it
// here and in the backend. `columns` drive the list table; `fields` drive the
// add/edit form.
import type { ModuleConfig } from '$lib/types';
import { STATE } from '$lib/status';

export const MODULES: ModuleConfig[] = [
	{
		key: 'todos',
		label: 'Todos',
		singular: 'todo',
		titleField: 'title',
		// Assignee and project_id are empty across every imported row, so they
		// start hidden — the column picker brings them back when they're in use.
		columns: [
			{ header: 'Title', field: 'title' },
			{ header: 'Status', field: 'status', render: 'badge' },
			{ header: 'Due', field: 'due', sort: 'date' },
			{ header: 'Tags', field: 'tags', render: 'tags' },
			{ header: 'Priority', field: 'priority' },
			{ header: 'Project', field: 'project_id_label', hidden: true },
			{ header: 'Assignee', field: 'assignee', hidden: true }
		],
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				// Matches the vocabulary the Notion import actually wrote.
				options: ['Not started', 'In progress', 'Done', 'Draft', 'Submitted']
			},
			{ name: 'project_id', label: 'Project', type: 'relation', ref: 'projects' },
			{ name: 'priority', label: 'Priority', type: 'text' },
			{ name: 'assignee', label: 'Assignee', type: 'text' },
			{ name: 'due', label: 'Due', type: 'date' },
			{ name: 'notes', label: 'Notes', type: 'textarea' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'board', 'group', 'calendar'],
		groupFields: ['status', 'priority', 'tags', 'due'],
		dateField: 'due',
		overdueField: 'due',
		statusField: 'status',
		doneValues: ['Done'],
		statusColors: {
			'Not started': STATE.idle,
			'In progress': STATE.progress,
			Done: STATE.done,
			Draft: STATE.muted,
			Submitted: STATE.good
		},
		defaultSort: { field: 'due', dir: 'asc' }
	},
	{
		key: 'notes',
		label: 'Notes & Meetings',
		singular: 'note',
		titleField: 'title',
		columns: [
			{ header: 'Title', field: 'title' },
			{ header: 'Kind', field: 'kind', render: 'badge' },
			{ header: 'When', field: 'meeting_time', sort: 'date' },
			{ header: 'Status', field: 'status', render: 'badge' },
			{ header: 'Type', field: 'meeting_type' },
			{ header: 'Project', field: 'project_id_label', hidden: true },
			{ header: 'Tags', field: 'tags', render: 'tags', hidden: true }
		],
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true },
			{ name: 'kind', label: 'Kind', type: 'select', options: ['note', 'meeting', 'journal'] },
			{ name: 'project_id', label: 'Project', type: 'relation', ref: 'projects' },
			{ name: 'meeting_type', label: 'Meeting type', type: 'text' },
			{ name: 'meeting_time', label: 'When', type: 'datetime' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: ['Upcoming', 'In Progress', 'Needs Attention', 'Completed']
			},
			{ name: 'attendees', label: 'Attendees', type: 'tags' },
			{ name: 'body', label: 'Body', type: 'textarea' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'board', 'group', 'calendar'],
		groupFields: ['kind', 'status', 'meeting_type', 'tags', 'meeting_time'],
		dateField: 'meeting_time',
		docField: 'body',
		statusField: 'status',
		doneValues: ['Completed'],
		statusColors: {
			Upcoming: STATE.idle,
			'In Progress': STATE.progress,
			'Needs Attention': STATE.attention,
			Completed: STATE.done
		},
		defaultSort: { field: 'meeting_time', dir: 'desc' }
	},
	{
		key: 'events',
		label: 'Calendar',
		singular: 'event',
		titleField: 'title',
		columns: [
			{ header: 'Title', field: 'title' },
			{ header: 'Kind', field: 'kind', render: 'badge' },
			{ header: 'Starts', field: 'starts_at', sort: 'date' },
			{ header: 'Location', field: 'location' },
			{ header: 'Project', field: 'project_id_label', hidden: true },
			{ header: 'Tags', field: 'tags', render: 'tags', hidden: true }
		],
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true },
			{
				name: 'kind',
				label: 'Kind',
				type: 'select',
				// 'daily-note' and 'meeting' are what the import produced; the rest
				// are hand-entry values kept from the original spec.
				options: ['event', 'meeting', 'daily-note', 'performance', 'deadline']
			},
			{ name: 'project_id', label: 'Project', type: 'relation', ref: 'projects' },
			{ name: 'starts_at', label: 'Starts', type: 'datetime' },
			{ name: 'ends_at', label: 'Ends', type: 'datetime' },
			{ name: 'all_day', label: 'All day', type: 'checkbox' },
			{ name: 'location', label: 'Location', type: 'text' },
			{ name: 'notes', label: 'Notes', type: 'textarea' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'board', 'group', 'calendar'],
		groupFields: ['kind', 'location', 'tags', 'starts_at'],
		dateField: 'starts_at',
		statusField: 'kind',
		// Kinds are categories rather than progress, so these read as a legend:
		// the two the import actually produced stay distinct, deadlines shout.
		statusColors: {
			'daily-note': STATE.muted,
			meeting: STATE.done,
			event: STATE.good,
			performance: STATE.progress,
			deadline: STATE.attention
		},
		defaultSort: { field: 'starts_at', dir: 'desc' }
	},
	{
		key: 'hardware',
		label: 'Hardware',
		singular: 'hardware item',
		titleField: 'name',
		columns: [
			{ header: 'Name', field: 'name' },
			{ header: 'Category', field: 'category' },
			{ header: 'Company', field: 'company' },
			{ header: 'CPU', field: 'cpu' },
			{ header: 'Qty', field: 'quantity' },
			{ header: 'Watts', field: 'power_w' }
		],
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true },
			{ name: 'category', label: 'Category', type: 'text' },
			{ name: 'company', label: 'Company', type: 'text' },
			{ name: 'cpu', label: 'CPU', type: 'text' },
			{ name: 'quantity', label: 'Quantity', type: 'number' },
			{ name: 'power_w', label: 'Power (W)', type: 'number' },
			{ name: 'path', label: 'Folder path', type: 'text' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'group'],
		groupFields: ['category', 'company', 'tags'],
		defaultSort: { field: 'name', dir: 'asc' }
	},
	{
		key: 'software',
		label: 'Software',
		singular: 'software item',
		titleField: 'name',
		columns: [
			{ header: 'Name', field: 'name' },
			{ header: 'URL', field: 'url' }
		],
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true },
			{ name: 'url', label: 'URL', type: 'text' },
			{ name: 'path', label: 'Folder path', type: 'text' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'group'],
		groupFields: ['tags'],
		defaultSort: { field: 'name', dir: 'asc' }
	},
	{
		key: 'projects',
		label: 'Projects',
		singular: 'project',
		titleField: 'name',
		columns: [
			{ header: 'Name', field: 'name' },
			{ header: 'Kind', field: 'kind' },
			{ header: 'Status', field: 'status', render: 'badge' },
			{ header: 'Summary', field: 'description' }
		],
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true },
			{
				name: 'kind',
				label: 'Kind',
				type: 'select',
				// The canonical kinds (see $lib/projects/kinds.ts); legacy values
				// from the import are normalized at read time.
				options: [
					'graphics',
					'motion graphics',
					'3d',
					'print',
					'video',
					'music',
					'album',
					'app dev',
					'ui/ux',
					'tech audit',
					'rebuild',
					'live show'
				]
			},
			{ name: 'status', label: 'Status', type: 'text' },
			{
				name: 'health',
				label: 'Health',
				type: 'select',
				options: ['on-track', 'at-risk', 'blocked']
			},
			{ name: 'start', label: 'Start', type: 'date' },
			{ name: 'due', label: 'Due', type: 'date' },
			{ name: 'year', label: 'Year', type: 'text' },
			{ name: 'path', label: 'Folder path', type: 'text' },
			{ name: 'description', label: 'Description', type: 'textarea' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'board', 'group'],
		groupFields: ['status', 'tags'],
		statusField: 'status',
		doneValues: ['archived', 'Archive', 'Complete', 'Completed'],
		// Lower-case values are what the archive import wrote; the capitalised
		// ones match the Projects tracker's own stage vocabulary.
		statusColors: {
			archived: STATE.muted,
			'Not Started': STATE.idle,
			'In Progress': STATE.progress,
			'Needs Attention': STATE.attention,
			Active: STATE.good,
			Complete: STATE.done,
			Archive: STATE.muted
		},
		defaultSort: { field: 'name', dir: 'asc' }
	},
	{
		key: 'media',
		label: 'Media',
		singular: 'media item',
		titleField: 'title',
		columns: [
			{ header: 'Title', field: 'title' },
			{ header: 'Type', field: 'media_type', render: 'badge' },
			{ header: 'Duration', field: 'duration' }
		],
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true },
			{
				name: 'media_type',
				label: 'Type',
				type: 'select',
				options: ['audio', 'visual', 'performance', 'track']
			},
			{ name: 'duration', label: 'Duration', type: 'text' },
			{ name: 'url', label: 'URL', type: 'text' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'board', 'group'],
		groupFields: ['media_type', 'tags'],
		statusField: 'media_type',
		statusColors: {
			audio: STATE.progress,
			visual: STATE.done,
			performance: STATE.good,
			track: STATE.muted
		},
		defaultSort: { field: 'title', dir: 'asc' }
	},
	{
		key: 'people',
		label: 'People',
		singular: 'person',
		titleField: 'name',
		columns: [
			{ header: 'Name', field: 'name' },
			{ header: 'Membership', field: 'membership_type' },
			{ header: 'About', field: 'about' }
		],
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true },
			{ name: 'membership_type', label: 'Membership', type: 'text' },
			{ name: 'about', label: 'About', type: 'textarea' },
			{ name: 'path', label: 'Folder path', type: 'text' },
			{ name: 'tags', label: 'Tags', type: 'tags' }
		],
		views: ['table', 'group'],
		groupFields: ['membership_type', 'tags'],
		defaultSort: { field: 'name', dir: 'asc' }
	}
];

export function getModule(key: string): ModuleConfig | undefined {
	return MODULES.find((m) => m.key === key);
}

// Short "patchbay" codes shown in the rail and on records.
export const MODULE_CODES: Record<string, string> = {
	todos: 'TODO',
	notes: 'NOTE',
	events: 'CAL',
	hardware: 'HW',
	software: 'SW',
	projects: 'PROJ',
	media: 'MEDIA',
	people: 'PPL'
};
