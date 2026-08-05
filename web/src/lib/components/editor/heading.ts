// Enter inside a heading always continues in a plain text block. ProseMirror
// only does this when the cursor sits exactly at the end of the line — split a
// heading anywhere earlier and the remainder keeps the heading type, so a
// Return near the end of an H3 lands you in another H3. Headings here are
// one-line titles, not prose, so the second half of a split is body text.
//
// Enter at the very start is left to the default: that's "push the heading
// down a line", and the heading should survive it.
import { Extension } from '@tiptap/core';

export const HeadingExit = Extension.create({
	name: 'headingExit',
	addKeyboardShortcuts() {
		return {
			Enter: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parent.type.name !== 'heading') return false;
				if ($from.parentOffset === 0) return false;
				return this.editor.chain().splitBlock().setParagraph().run();
			}
		};
	}
});
