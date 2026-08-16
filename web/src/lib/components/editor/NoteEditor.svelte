<script lang="ts">
	// Live block editor for note documents: markdown in, markdown out, but you
	// edit formatted text. Typing shortcuts transform as you type (`# `, `- `,
	// `1. `, `> `, `**bold**`, `` ` `` …), `[ ]` starts a to-do, and "/" opens
	// the block menu (slash.ts). Blocks reorder two ways: drag by the grip, or
	// Alt-ArrowUp/Down (move.ts) when the drop target is fiddly.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Editor, Extension } from '@tiptap/core';
	import DragHandle from '@tiptap/extension-drag-handle';
	import StarterKit from '@tiptap/starter-kit';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
	import { Placeholder } from '@tiptap/extensions';
	import { Markdown } from 'tiptap-markdown';
	import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
	import { slashExtension, type SlashItem } from './slash';
	import { HeadingExit } from './heading';
	import { BlockMove } from './move';
	import { MarkdownTable } from './table';
	import { PlainText } from './text';
	import { NoteButton, isExternal, type ButtonVariant, type NoteButtonAttrs } from './button';
	import { FontSpecimenBlock } from './specimen';
	import { EmptyTaskItems } from './tasks';
	import ButtonDialog from './ButtonDialog.svelte';
	import TableControls from './TableControls.svelte';

	let {
		value = '',
		onchange,
		onsave,
		placeholder = "Write — '/' for blocks, or just type markdown…",
		// A full-page document wants room to breathe; the same editor inline in a
		// record form should not tower over the fields around it.
		minHeight = 180
	}: {
		value?: string;
		onchange: (md: string) => void;
		onsave?: () => void;
		placeholder?: string;
		minHeight?: number;
	} = $props();

	let host: HTMLDivElement;
	// The positioned box the table handles are measured and drawn against.
	let frame = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);

	// The button whose settings dialog is open, and where it lives in the doc.
	let buttonDialog = $state<{ attrs: NoteButtonAttrs; pos: number; isNew: boolean } | null>(null);
	let buttonOpen = $state(false);

	// Slash menu state (rendered here, driven by slash.ts callbacks).
	let menu = $state<{ items: SlashItem[]; index: number; x: number; y: number } | null>(null);
	let applyItem: ((item: SlashItem) => void) | null = null;
	// Live caret-rect getter, kept so the fixed-position menu can track the
	// caret when the page scrolls instead of staying pinned where it opened.
	let anchor: (() => DOMRect | null | undefined) | null = null;

	function place(props: SuggestionProps<SlashItem>) {
		anchor = props.clientRect ?? null;
		const rect = anchor?.();
		if (!rect) return;
		menu = {
			items: props.items,
			index: 0,
			x: Math.min(rect.left, window.innerWidth - 280),
			y: rect.bottom + 6
		};
		applyItem = (item) => props.command(item);
	}

	function reposition() {
		const rect = anchor?.();
		if (!menu || !rect) return;
		menu.x = Math.min(rect.left, window.innerWidth - 280);
		menu.y = rect.bottom + 6;
	}

	function menuKey({ event }: SuggestionKeyDownProps): boolean {
		if (!menu) return false;
		if (event.key === 'ArrowDown') {
			menu.index = (menu.index + 1) % menu.items.length;
			return true;
		}
		if (event.key === 'ArrowUp') {
			menu.index = (menu.index - 1 + menu.items.length) % menu.items.length;
			return true;
		}
		if (event.key === 'Enter') {
			const item = menu.items[menu.index];
			if (item) applyItem?.(item);
			return true;
		}
		if (event.key === 'Escape') {
			menu = null;
			return true;
		}
		return false;
	}

	function openButtonDialog(attrs: NoteButtonAttrs, pos: number, isNew: boolean) {
		buttonDialog = { attrs, pos, isNew };
		buttonOpen = true;
	}

	function followButton(href: string) {
		// External targets leave the app; in-app ones go through `goto` so the
		// page's beforeNavigate guard still flushes a pending autosave.
		if (isExternal(href)) window.open(href, '_blank', 'noreferrer');
		else goto(href);
	}

	onMount(() => {
		editor = new Editor({
			element: host,
			extensions: [
				// trailingNode off: it force-appends an empty paragraph whenever the
				// document ends in a heading, but markdown storage drops that
				// paragraph on save — so it flickered in and out between edits and
				// read like "# " creating two rows. Gapcursor still covers typing
				// below a trailing table.
				StarterKit.configure({ link: { openOnClick: false }, text: false, trailingNode: false }),
				PlainText,
				HeadingExit,
				BlockMove,
				TaskList,
				TaskItem.configure({ nested: true }),
				EmptyTaskItems,
				MarkdownTable.configure({ resizable: true }),
				TableRow,
				TableHeader,
				TableCell,
				NoteButton.configure({ onEdit: openButtonDialog, onOpen: followButton }),
				FontSpecimenBlock,
				DragHandle.configure({
					render() {
						const el = document.createElement('div');
						el.className = 'block-drag-handle';
						el.setAttribute('aria-hidden', 'true');
						el.innerHTML =
							'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
						return el;
					}
				}),
				Placeholder.configure({ placeholder }),
				Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
				slashExtension({
					onStart: place,
					onUpdate: place,
					onKeyDown: menuKey,
					onExit: () => (menu = null)
				}),
				Extension.create({
					name: 'saveShortcut',
					addKeyboardShortcuts() {
						return {
							'Mod-Enter': () => {
								onsave?.();
								return true;
							}
						};
					}
				})
			],
			content: value,
			autofocus: value.trim() ? false : 'end',
			onUpdate: ({ editor: e }) =>
				onchange(
					(e.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown()
				)
		});
		return () => editor?.destroy();
	});

	// Follow external value changes. The editor reads `content` once at mount,
	// which can be before the parent has loaded the record's body — without
	// this, a note with existing content mounts as an empty editor, and the
	// next autosave would overwrite the stored body with that emptiness.
	$effect(() => {
		const md = value;
		if (!editor) return;
		const current = (
			editor.storage as unknown as { markdown: { getMarkdown: () => string } }
		).markdown.getMarkdown();
		if (md !== current) editor.commands.setContent(md, { emitUpdate: false });
	});
</script>

<svelte:window onscrollcapture={reposition} onresize={reposition} />

<!-- Positioned so TableControls can lay its handles over the document. Tables
     carry their own margins (see the .tableWrapper rule) to leave room for the
     handles, rather than the whole document being inset for them. -->
<div bind:this={frame} class="relative" style="--editor-min-h:{minHeight}px">
	<div bind:this={host} class="note-editor"></div>
	<TableControls {editor} container={frame ?? null} />
</div>

{#if buttonDialog}
	<ButtonDialog
		bind:open={buttonOpen}
		attrs={buttonDialog.attrs}
		isNew={buttonDialog.isNew}
		onsubmit={(next: { label: string; href: string; variant: ButtonVariant }) =>
			editor?.commands.updateNoteButtonAt(buttonDialog!.pos, next)}
		onremove={() => editor?.commands.removeNoteButtonAt(buttonDialog!.pos)}
	/>
{/if}

{#if menu}
	<div
		class="fixed z-50 max-h-[340px] w-[260px] overflow-y-auto rounded-[10px] border bg-popover shadow-[0_12px_40px_rgba(0,0,0,.18)]"
		style="left:{menu.x}px;top:{menu.y}px;"
	>
		<!-- Keyed by position: user templates join the list, and a template is
		     allowed to share a title with a built-in block. -->
		{#each menu.items as item, i (i)}
			<button
				type="button"
				onclick={() => applyItem?.(item)}
				onmouseenter={() => menu && (menu.index = i)}
				class="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2 text-left {i === menu.index
					? 'bg-accent'
					: ''}"
			>
				<span
					class="grid w-[38px] flex-none place-items-center rounded-[6px] border bg-card py-1 font-mono text-[10px] text-muted-foreground"
					>{item.hint.trim() || '·'}</span
				>
				<span class="text-[13px] font-medium">{item.title}</span>
			</button>
		{:else}
			<div class="px-3.5 py-2.5 text-[12.5px] text-muted-foreground">No matching block.</div>
		{/each}
	</div>
{/if}

<style>
	/* The document itself — mirrors MarkdownDoc's prose styling. */
	.note-editor :global(.ProseMirror) {
		outline: none;
		font-size: 14px;
		line-height: 1.55;
		color: color-mix(in oklab, var(--foreground) 85%, transparent);
		min-height: var(--editor-min-h, 180px);
	}
	.note-editor :global(h1) {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 1em 0 0.35em;
	}
	.note-editor :global(h2) {
		font-size: 17px;
		font-weight: 700;
		margin: 0.95em 0 0.3em;
	}
	.note-editor :global(h3) {
		font-size: 14.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0.9em 0 0.25em;
	}
	.note-editor :global(h1:first-child),
	.note-editor :global(h2:first-child),
	.note-editor :global(h3:first-child) {
		margin-top: 0.1em;
	}
	.note-editor :global(p) {
		margin: 0.3em 0;
	}
	.note-editor :global(ul),
	.note-editor :global(ol) {
		margin: 0.3em 0;
		padding-left: 1.4em;
	}
	.note-editor :global(ul) {
		list-style: disc;
	}
	.note-editor :global(ol) {
		list-style: decimal;
	}
	.note-editor :global(li) {
		margin: 0.12em 0;
	}
	.note-editor :global(blockquote) {
		border-left: 3px solid var(--border);
		margin: 0.5em 0;
		padding: 0.1em 0 0.1em 0.9em;
		color: var(--muted-foreground);
	}
	.note-editor :global(code) {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 12px;
		background: var(--muted);
		border-radius: 4px;
		padding: 0.1em 0.35em;
	}
	.note-editor :global(pre) {
		background: var(--muted);
		border-radius: 8px;
		padding: 10px 12px;
		overflow-x: auto;
		margin: 0.5em 0;
	}
	.note-editor :global(pre code) {
		background: transparent;
		padding: 0;
	}
	.note-editor :global(a) {
		color: #3a6ea5;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.note-editor :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1em 0;
	}
	/* Tables. The wrapper carries the margins that leave room for the row and
	   column handles, so the rest of the document isn't inset for them. */
	.note-editor :global(.tableWrapper) {
		/* The generous top/bottom/left space is where TableControls draws its
		   handles — they sit outside the table's own box. */
		margin: 1.5em 0 2.1em 14px;
		padding-right: 26px;
		overflow-x: auto;
	}
	.note-editor :global(table) {
		border-collapse: collapse;
		table-layout: fixed;
		width: 100%;
		margin: 0;
		font-size: 13px;
	}
	.note-editor :global(th),
	.note-editor :global(td) {
		position: relative;
		border: 1px solid var(--border);
		padding: 4px 10px;
		text-align: left;
		vertical-align: top;
		min-width: 60px;
	}
	.note-editor :global(th) {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-foreground);
		background: color-mix(in oklab, var(--muted) 55%, transparent);
	}
	.note-editor :global(th p),
	.note-editor :global(td p) {
		margin: 0;
	}
	/* prosemirror-tables' own affordances: multi-cell selection and the drag
	   handle that appears between columns. */
	.note-editor :global(.selectedCell::after) {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in oklab, var(--ring) 18%, transparent);
		pointer-events: none;
	}
	.note-editor :global(.column-resize-handle) {
		position: absolute;
		top: 0;
		right: -2px;
		bottom: 0;
		width: 4px;
		background: var(--ring);
		pointer-events: none;
	}
	.note-editor :global(.ProseMirror.resize-cursor) {
		cursor: col-resize;
	}
	/* Buttons. Same shape as MarkdownDoc's, so the doc and read views match. */
	.note-editor :global(a.btn) {
		display: inline-block;
		padding: 3px 12px;
		border: 1px solid transparent;
		border-radius: 7px;
		font-size: 12.5px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
	}
	.note-editor :global(a.btn[data-variant='primary']) {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.note-editor :global(a.btn[data-variant='secondary']) {
		background: var(--card);
		border-color: var(--border);
		color: var(--foreground);
	}
	.note-editor :global(a.btn:hover) {
		filter: brightness(1.1);
	}
	.note-editor :global(a.btn.ProseMirror-selectednode) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	/* Task lists */
	.note-editor :global(ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0.2em;
	}
	.note-editor :global(ul[data-type='taskList'] li) {
		display: flex;
		gap: 0.55em;
		align-items: baseline;
	}
	.note-editor :global(ul[data-type='taskList'] li > label) {
		flex: 0 0 auto;
	}
	.note-editor :global(ul[data-type='taskList'] li[data-checked='true'] > div) {
		color: var(--muted-foreground);
		text-decoration: line-through;
	}
	/* The per-block drag handle (extension-drag-handle positions it; we only
	   style it). Grab a block by the grip to reorder it. */
	.note-editor :global(.block-drag-handle) {
		display: grid;
		place-items: center;
		width: 20px;
		height: 22px;
		border-radius: 5px;
		color: var(--muted-foreground);
		cursor: grab;
		opacity: 0.55;
	}
	.note-editor :global(.block-drag-handle:hover) {
		background: var(--muted);
		opacity: 1;
	}
	.note-editor :global(.block-drag-handle:active) {
		cursor: grabbing;
	}
	/* Placeholder */
	.note-editor :global(p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--muted-foreground);
	}
</style>
