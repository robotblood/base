// Enter inside a heading always continues in a plain text block. ProseMirror
// only does this when the cursor sits exactly at the end of the line — split a
// heading anywhere earlier and the remainder keeps the heading type, so a
// Return near the end of an H3 lands you in another H3. Headings here are
// one-line titles, not prose, so the second half of a split is body text.
//
// Done as one explicit split with the after-type forced to paragraph. The
// previous splitBlock().setParagraph() chain broke under tiptap v3: the chain
// reported failure, so the default Enter handler ran *again* on top of it —
// one Return minted two blank rows and demoted the heading below. A single
// transaction can't half-succeed, and returning true keeps every other Enter
// handler out of it.
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
				return this.editor
					.chain()
					.command(({ tr, state, dispatch }) => {
						if (dispatch) {
							tr.split($from.pos, 1, [{ type: state.schema.nodes.paragraph }]);
							tr.scrollIntoView();
						}
						return true;
					})
					.run();
			}
		};
	}
});
