<script lang="ts">
	// Live block editor for note documents: markdown in, markdown out, but you
	// edit formatted text. Typing shortcuts transform as you type (`# `, `- `,
	// `1. `, `> `, `**bold**`, `` ` `` …), `[ ]` starts a to-do, and "/" opens
	// the block menu (slash.ts).
	import { onMount } from 'svelte';
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import { Placeholder } from '@tiptap/extensions';
	import { Markdown } from 'tiptap-markdown';
	import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
	import { slashExtension, type SlashItem } from './slash';

	let {
		value = '',
		onchange,
		onsave,
		placeholder = "Write — '/' for blocks, or just type markdown…"
	}: {
		value?: string;
		onchange: (md: string) => void;
		onsave?: () => void;
		placeholder?: string;
	} = $props();

	let host: HTMLDivElement;
	let editor: Editor | null = null;

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

	onMount(() => {
		editor = new Editor({
			element: host,
			extensions: [
				StarterKit.configure({ link: { openOnClick: false } }),
				TaskList,
				TaskItem.configure({ nested: true }),
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

<div bind:this={host} class="note-editor min-h-[180px]"></div>

{#if menu}
	<div
		class="fixed z-50 w-[260px] overflow-hidden rounded-[10px] border bg-popover shadow-[0_12px_40px_rgba(0,0,0,.18)]"
		style="left:{menu.x}px;top:{menu.y}px;"
	>
		{#each menu.items as item, i (item.title)}
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
		line-height: 1.65;
		color: color-mix(in oklab, var(--foreground) 85%, transparent);
		min-height: 180px;
	}
	.note-editor :global(h1) {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 1.1em 0 0.4em;
	}
	.note-editor :global(h2) {
		font-size: 17px;
		font-weight: 700;
		margin: 1.1em 0 0.35em;
	}
	.note-editor :global(h3) {
		font-size: 14.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 1em 0 0.3em;
	}
	.note-editor :global(h1:first-child),
	.note-editor :global(h2:first-child),
	.note-editor :global(h3:first-child) {
		margin-top: 0.1em;
	}
	.note-editor :global(p) {
		margin: 0.45em 0;
	}
	.note-editor :global(ul),
	.note-editor :global(ol) {
		margin: 0.45em 0;
		padding-left: 1.4em;
	}
	.note-editor :global(ul) {
		list-style: disc;
	}
	.note-editor :global(ol) {
		list-style: decimal;
	}
	.note-editor :global(li) {
		margin: 0.18em 0;
	}
	.note-editor :global(blockquote) {
		border-left: 3px solid var(--border);
		margin: 0.6em 0;
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
		margin: 0.6em 0;
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
	/* Placeholder */
	.note-editor :global(p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--muted-foreground);
	}
</style>
