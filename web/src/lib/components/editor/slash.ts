// The "/" block menu: a TipTap Suggestion wired to a list of block commands.
// The menu itself is rendered by NoteEditor.svelte via the callbacks here —
// this module owns what the commands are and how they apply.
import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps
} from '@tiptap/suggestion';

export interface SlashItem {
	title: string;
	hint: string; // shown dim, also documents the typing shortcut
	keywords: string; // matched against the query, e.g. "/h3"
	run: (editor: Editor, range: Range) => void;
}

const chain = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);

export const SLASH_ITEMS: SlashItem[] = [
	{
		title: 'Heading 1',
		hint: '# ',
		keywords: 'h1 heading title big',
		run: (e, r) => chain(e, r).setNode('heading', { level: 1 }).run()
	},
	{
		title: 'Heading 2',
		hint: '## ',
		keywords: 'h2 heading section',
		run: (e, r) => chain(e, r).setNode('heading', { level: 2 }).run()
	},
	{
		title: 'Heading 3',
		hint: '### ',
		keywords: 'h3 heading small',
		run: (e, r) => chain(e, r).setNode('heading', { level: 3 }).run()
	},
	{
		title: 'Bullet list',
		hint: '- ',
		keywords: 'ul bullet list dash',
		run: (e, r) => chain(e, r).toggleBulletList().run()
	},
	{
		title: 'Numbered list',
		hint: '1. ',
		keywords: 'ol numbered ordered list',
		run: (e, r) => chain(e, r).toggleOrderedList().run()
	},
	{
		title: 'To-do list',
		hint: '[ ] ',
		keywords: 'todo task check checkbox [] [ ] tasks',
		run: (e, r) => chain(e, r).toggleTaskList().run()
	},
	{
		title: 'Quote',
		hint: '> ',
		keywords: 'quote blockquote callout',
		run: (e, r) => chain(e, r).toggleBlockquote().run()
	},
	{
		title: 'Code block',
		hint: '```',
		keywords: 'code snippet pre fence',
		run: (e, r) => chain(e, r).toggleCodeBlock().run()
	},
	{
		title: 'Divider',
		hint: '---',
		keywords: 'divider rule separator hr',
		run: (e, r) => chain(e, r).setHorizontalRule().run()
	}
];

export function filterSlash(query: string): SlashItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return SLASH_ITEMS;
	return SLASH_ITEMS.filter(
		(i) => i.title.toLowerCase().includes(q) || i.keywords.includes(q)
	);
}

export interface SlashCallbacks {
	onStart: (props: SuggestionProps<SlashItem>) => void;
	onUpdate: (props: SuggestionProps<SlashItem>) => void;
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
	onExit: () => void;
}

export function slashExtension(cb: SlashCallbacks) {
	return Extension.create({
		name: 'slashMenu',
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashItem>({
					editor: this.editor,
					char: '/',
					allowSpaces: false,
					command: ({ editor, range, props }) => props.run(editor, range),
					items: ({ query }) => filterSlash(query),
					render: () => ({
						onStart: cb.onStart,
						onUpdate: cb.onUpdate,
						onKeyDown: cb.onKeyDown,
						onExit: cb.onExit
					})
				})
			];
		}
	});
}
