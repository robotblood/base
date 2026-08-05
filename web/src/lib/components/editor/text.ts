// tiptap-markdown runs every text node through an HTML escape on the way out,
// so a note that mentions "kill <PID>" or "<module>/<root>" is rewritten to
// "kill &lt;PID&gt;" the first time it is edited — the document still *reads*
// correctly, but the stored markdown and the raw md tab fill up with entities.
//
// That guard is for editors that parse raw HTML back in. This one doesn't: the
// markdown parser runs with `html: false`, and the single exception is the
// button anchor, which has its own inline rule (see button.ts). So the escape
// buys nothing here and only damages the text.
//
// Registered in place of StarterKit's text node (`text: false`).
import { Text } from '@tiptap/extension-text';
import type { Node as PMNode } from '@tiptap/pm/model';

export const PlainText = Text.extend({
	addStorage() {
		return {
			...this.parent?.(),
			markdown: {
				serialize(state: { text: (s: string) => void }, node: PMNode) {
					// Still markdown-escaped by the serializer state (`*`, `[`, …) —
					// it's only the HTML entity pass that's dropped.
					state.text(node.text ?? '');
				},
				parse: {
					// handled by markdown-it
				}
			}
		};
	}
});
