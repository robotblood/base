// Table templates: named starting points for the admin table builder, à la
// Notion's database templates. Each is just a bundle of FieldSpecs — the
// builder copies them into editable drafts, so applying one is never a
// commitment. Title is pinned by the builder and deliberately absent here.
import type { FieldSpec } from '$lib/types';

export interface TableTemplate {
	key: string;
	name: string; // suggested table name (used if the name box is empty)
	hint: string; // one-liner under the chip
	fields: FieldSpec[]; // everything except the pinned title row
}

// `name` values here are placeholders — the builder re-slugs from the label on
// save, same as hand-added fields, so renaming a label before saving is safe.
const f = (label: string, spec: Partial<FieldSpec> = {}): FieldSpec => ({
	name: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
	label,
	type: 'text',
	...spec
});

export const TABLE_TEMPLATES: TableTemplate[] = [
	{
		key: 'tasks',
		name: 'Tasks',
		hint: 'status board + due dates',
		fields: [
			f('Status', { type: 'select', options: ['To do', 'In progress', 'Done'] }),
			f('Priority', { type: 'select', options: ['Low', 'Medium', 'High'] }),
			f('Due', { type: 'date' }),
			f('Notes', { type: 'textarea' })
		]
	},
	{
		key: 'contacts',
		name: 'Contacts',
		hint: 'people + orgs',
		fields: [
			f('Email'),
			f('Phone'),
			f('Company'),
			f('Role'),
			f('Tags', { type: 'tags' }),
			f('Notes', { type: 'textarea' })
		]
	},
	{
		key: 'inventory',
		name: 'Inventory',
		hint: 'what, where, how many',
		fields: [
			f('Category', { type: 'select', options: ['Gear', 'Supplies', 'Parts', 'Other'] }),
			f('Quantity', { type: 'number' }),
			f('Location'),
			f('Purchased', { type: 'date' }),
			f('Notes', { type: 'textarea' })
		]
	},
	{
		key: 'reading',
		name: 'Reading list',
		hint: 'books + status + rating',
		fields: [
			f('Author'),
			f('Status', { type: 'select', options: ['To read', 'Reading', 'Finished', 'Abandoned'] }),
			f('Rating', { type: 'number' }),
			f('Finished', { type: 'date' }),
			f('Notes', { type: 'textarea' })
		]
	},
	{
		key: 'expenses',
		name: 'Expenses',
		hint: 'amount, category, date',
		fields: [
			f('Amount', { type: 'number', required: true }),
			f('Category', {
				type: 'select',
				options: ['Housing', 'Food', 'Transport', 'Gear', 'Subscriptions', 'Other']
			}),
			f('Date', { type: 'date' }),
			f('Vendor')
		]
	}
];
