<script lang="ts">
	// Notion-style handles for the table under the pointer (or the caret): a grip
	// per column across the top, a grip per row down the left, and a "+" on the
	// far edge of each axis. Clicking a grip selects that row or column and opens
	// its menu.
	//
	// The overlay is measured from the live table DOM rather than tracked in
	// state, so it stays correct through column resizes and edits without the
	// editor needing to tell it anything.
	import type { Editor } from '@tiptap/core';

	// `container` is the positioned box this overlay fills; every offset below is
	// measured against it.
	let { editor, container }: { editor: Editor | null; container: HTMLElement | null } = $props();

	type Grip = { offset: number; size: number; index: number };
	type Menu = { axis: 'row' | 'col'; index: number; x: number; y: number };

	let cols = $state<Grip[]>([]);
	let rows = $state<Grip[]>([]);
	let frame = $state<{ left: number; top: number; width: number; height: number } | null>(null);
	let menu = $state<Menu | null>(null);

	let hovered: HTMLTableElement | null = null;
	let pending = 0;

	// Re-measuring is requested by editor events, not by reactive state: an
	// effect that both depended on a counter and wrote the measurements back
	// would close a loop with the editor's own transaction stream. The frame
	// callback also coalesces the burst of transactions a single edit produces.
	function schedule() {
		if (pending) return;
		pending = requestAnimationFrame(() => {
			pending = 0;
			measure();
		});
	}

	/** The table the caret currently sits in, if any. */
	function caretTable(): HTMLTableElement | null {
		if (!editor) return null;
		const { state, view } = editor;
		// Not `$from` — Svelte reserves the $ prefix for its own bindings.
		const at = state.selection.$from;
		for (let d = at.depth; d > 0; d--) {
			if (at.node(d).type.name === 'table') {
				const dom = view.nodeDOM(at.before(d)) as HTMLElement | null;
				// Resizable tables are wrapped in a .tableWrapper div.
				return dom?.querySelector('table') ?? (dom as HTMLTableElement | null);
			}
		}
		return null;
	}

	// The table under the pointer wins; otherwise fall back to the one being
	// edited, so the handles stay put while a menu is open or the mouse is away.
	const activeTable = (): HTMLTableElement | null => hovered ?? caretTable();

	// Assigning unconditionally would re-render the overlay on every keystroke,
	// so measurements are only written when they actually move.
	const sameGrips = (a: Grip[], b: Grip[]) =>
		a.length === b.length &&
		a.every((g, i) => g.offset === b[i].offset && g.size === b[i].size);

	function measure() {
		const table = activeTable();
		const box = container?.getBoundingClientRect();
		if (!table || !box || !table.rows.length) {
			if (cols.length) cols = [];
			if (rows.length) rows = [];
			if (frame) frame = null;
			return;
		}
		const t = table.getBoundingClientRect();
		const nextFrame = {
			left: t.left - box.left,
			top: t.top - box.top,
			width: t.width,
			height: t.height
		};
		const nextCols = Array.from(table.rows[0].cells).map((cell, index) => {
			const r = cell.getBoundingClientRect();
			return { offset: r.left - box.left, size: r.width, index };
		});
		const nextRows = Array.from(table.rows).map((row, index) => {
			const r = row.getBoundingClientRect();
			return { offset: r.top - box.top, size: r.height, index };
		});

		if (
			!frame ||
			frame.left !== nextFrame.left ||
			frame.top !== nextFrame.top ||
			frame.width !== nextFrame.width ||
			frame.height !== nextFrame.height
		) {
			frame = nextFrame;
		}
		if (!sameGrips(cols, nextCols)) cols = nextCols;
		if (!sameGrips(rows, nextRows)) rows = nextRows;
	}

	// Re-measure whenever the editor changes or the page moves under it.
	$effect(() => {
		if (!editor) return;
		editor.on('transaction', schedule);
		window.addEventListener('scroll', schedule, true);
		window.addEventListener('resize', schedule);
		schedule();
		return () => {
			editor.off('transaction', schedule);
			window.removeEventListener('scroll', schedule, true);
			window.removeEventListener('resize', schedule);
			if (pending) cancelAnimationFrame(pending);
		};
	});

	$effect(() => {
		if (!container) return;
		const over = (e: MouseEvent) => {
			const next = (e.target as HTMLElement | null)?.closest?.('table') ?? null;
			if (next !== hovered) {
				hovered = next as HTMLTableElement | null;
				schedule();
			}
		};
		const out = () => {
			if (menu || !hovered) return;
			hovered = null;
			schedule();
		};
		container.addEventListener('mousemove', over);
		container.addEventListener('mouseleave', out);
		return () => {
			container.removeEventListener('mousemove', over);
			container.removeEventListener('mouseleave', out);
		};
	});

	/** Put the caret in a cell, so the table commands act on the right axis. */
	function focusCell(rowIndex: number, colIndex: number) {
		const table = activeTable();
		const cell = table?.rows[rowIndex]?.cells[colIndex];
		if (!cell || !editor) return;
		const r = cell.getBoundingClientRect();
		const at = editor.view.posAtCoords({ left: r.left + 8, top: r.top + r.height / 2 });
		if (at) editor.chain().focus().setTextSelection(at.pos).run();
	}

	function openMenu(axis: 'row' | 'col', index: number, event: MouseEvent) {
		event.preventDefault();
		if (axis === 'col') focusCell(0, index);
		else focusCell(index, 0);
		const box = container?.getBoundingClientRect();
		if (!box) return;
		menu = {
			axis,
			index,
			x: event.clientX - box.left,
			y: event.clientY - box.top
		};
	}

	function run(fn: () => void) {
		fn();
		menu = null;
		schedule();
	}

	// Appending works off the last row/column, so the caret has to land there
	// first — the commands are all relative to the current cell.
	function appendColumn() {
		focusCell(0, cols.length - 1);
		editor?.chain().focus().addColumnAfter().run();
		schedule();
	}

	function appendRow() {
		focusCell(rows.length - 1, 0);
		editor?.chain().focus().addRowAfter().run();
		schedule();
	}

	const colActions = () => [
		{ label: 'Insert left', run: () => editor?.chain().focus().addColumnBefore().run() },
		{ label: 'Insert right', run: () => editor?.chain().focus().addColumnAfter().run() },
		{ label: 'Delete column', run: () => editor?.chain().focus().deleteColumn().run() },
		{ label: 'Toggle header row', run: () => editor?.chain().focus().toggleHeaderRow().run() }
	];

	const rowActions = () => [
		{ label: 'Insert above', run: () => editor?.chain().focus().addRowBefore().run() },
		{ label: 'Insert below', run: () => editor?.chain().focus().addRowAfter().run() },
		{ label: 'Delete row', run: () => editor?.chain().focus().deleteRow().run() }
	];
</script>

<svelte:window onclick={() => (menu = null)} />

{#if frame}
	<!-- Pointer-transparent by default; only the handles themselves take clicks. -->
	<div class="pointer-events-none absolute inset-0 z-20">
		{#each cols as col (col.index)}
			<button
				type="button"
				aria-label="Column {col.index + 1} options"
				onmousedown={(e) => openMenu('col', col.index, e)}
				onclick={(e) => e.stopPropagation()}
				class="grip pointer-events-auto absolute"
				style="left:{col.offset}px;top:{frame.top - 12}px;width:{col.size}px;height:9px;"
			></button>
		{/each}

		{#each rows as row (row.index)}
			<button
				type="button"
				aria-label="Row {row.index + 1} options"
				onmousedown={(e) => openMenu('row', row.index, e)}
				onclick={(e) => e.stopPropagation()}
				class="grip pointer-events-auto absolute"
				style="left:{frame.left - 12}px;top:{row.offset}px;width:9px;height:{row.size}px;"
			></button>
		{/each}

		<button
			type="button"
			aria-label="Add column"
			onclick={(e) => {
				e.stopPropagation();
				appendColumn();
			}}
			class="plus pointer-events-auto absolute"
			style="left:{frame.left + frame.width + 6}px;top:{frame.top}px;width:18px;height:18px;"
		>
			+
		</button>
		<button
			type="button"
			aria-label="Add row"
			onclick={(e) => {
				e.stopPropagation();
				appendRow();
			}}
			class="plus pointer-events-auto absolute"
			style="left:{frame.left}px;top:{frame.top + frame.height + 6}px;width:18px;height:18px;"
		>
			+
		</button>
		<button
			type="button"
			aria-label="Delete table"
			onclick={(e) => {
				e.stopPropagation();
				run(() => editor?.chain().focus().deleteTable().run());
			}}
			class="plus pointer-events-auto absolute"
			style="left:{frame.left - 14}px;top:{frame.top - 14}px;width:12px;height:12px;font-size:9px;"
		>
			×
		</button>
	</div>
{/if}

{#if menu}
	<div
		class="absolute z-30 w-[152px] overflow-hidden rounded-[9px] border bg-popover shadow-[0_12px_40px_rgba(0,0,0,.18)]"
		style="left:{menu.x}px;top:{menu.y}px;"
	>
		{#each menu.axis === 'col' ? colActions() : rowActions() as action (action.label)}
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					run(action.run);
				}}
				class="block w-full cursor-pointer px-3 py-1.5 text-left text-[12.5px] hover:bg-accent"
			>
				{action.label}
			</button>
		{/each}
	</div>
{/if}

<style>
	.grip {
		border-radius: 3px;
		background: color-mix(in oklab, var(--border) 70%, transparent);
		cursor: pointer;
		transition: background 0.12s;
	}
	.grip:hover {
		background: var(--muted-foreground);
	}
	.plus {
		display: grid;
		place-items: center;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--muted-foreground);
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
	}
	.plus:hover {
		background: var(--accent);
		color: var(--foreground);
	}
</style>
