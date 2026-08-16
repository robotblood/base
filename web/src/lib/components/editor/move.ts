// Alt-ArrowUp / Alt-ArrowDown move the block the cursor is in past its
// sibling — the keyboard twin of the drag handle, for the moves the mouse
// makes fiddly (swapping a paragraph between two tightly-spaced headings).
//
// "Block" means the top-level node under the document, with one refinement:
// inside a list, the list *item* moves within its list instead of the whole
// list jumping the document. The swap is a delete + reinsert of the two
// siblings, so the moved node arrives intact — marks, attributes, nested
// content and all — and the cursor rides along at the same offset.
import { Extension } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';

const ITEM_TYPES = new Set(['listItem', 'taskItem']);

function moveBlock(state: EditorState, dir: -1 | 1): Transaction | null {
	const { $from, $to } = state.selection;
	// A selection spanning top-level blocks has no single block to move.
	if ($from.index(0) !== $to.index(0)) return null;

	// Default to the document's own child; step in only for list items.
	let depth = 1;
	for (let d = $from.depth; d > 0; d--) {
		if (ITEM_TYPES.has($from.node(d).type.name)) {
			depth = d;
			break;
		}
	}

	const parent = $from.node(depth - 1);
	const index = $from.index(depth - 1);
	const target = index + dir;
	if (target < 0 || target >= parent.childCount) return null;

	// Positions of the two siblings, low one first.
	const lo = Math.min(index, target);
	const parentStart = $from.start(depth - 1);
	let from = parentStart;
	for (let j = 0; j < lo; j++) from += parent.child(j).nodeSize;
	const a = parent.child(lo);
	const b = parent.child(lo + 1);

	const tr = state.tr.delete(from, from + a.nodeSize + b.nodeSize);
	tr.insert(from, Fragment.from([b, a]));

	// The cursor's offset inside the moved node is unchanged; only the node's
	// start position shifts (up: to `from`; down: past the swapped sibling).
	const nodeStart = dir < 0 ? from : from + b.nodeSize;
	const offset = $from.pos - (parentStart + sizeBefore(parent, index));
	tr.setSelection(Selection.near(tr.doc.resolve(nodeStart + offset)));
	return tr.scrollIntoView();
}

function sizeBefore(parent: { child(i: number): { nodeSize: number } }, index: number): number {
	let size = 0;
	for (let j = 0; j < index; j++) size += parent.child(j).nodeSize;
	return size;
}

export const BlockMove = Extension.create({
	name: 'blockMove',
	addKeyboardShortcuts() {
		const run = (dir: -1 | 1) => () => {
			const { state, view } = this.editor;
			const tr = moveBlock(state, dir);
			if (!tr) return false;
			view.dispatch(tr);
			return true;
		};
		return {
			'Alt-ArrowUp': run(-1),
			'Alt-ArrowDown': run(1)
		};
	}
});
