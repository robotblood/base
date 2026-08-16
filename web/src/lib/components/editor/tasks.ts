// Empty to-do slots. markdown-it-task-lists only recognizes a checkbox when
// text follows the marker — `- [ ] buy strings` works, but the empty slot
// `- [ ]` that the weekly-note ritual and markdown templates produce falls
// through and renders as a bullet with literal brackets. Worse than cosmetic:
// once literal, the serializer backslash-escapes it to `- \[ \]` on the next
// save, and the Overview's checkbox toggle stops matching the line.
//
// This rule runs before inline parsing and pads exactly those empty checkbox
// lines with the trailing space the plugin wants; the plugin then slices the
// whole marker off, so the pad never reaches the document or the stored
// markdown. Lines already escaped by the bug are unescaped here too — opening
// the note heals them.
import { Extension } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';

const EMPTY_MARK = /^\\?\[( |x|X)\\?\]$/;

type CoreState = { tokens: { type: string; content: string }[] };

function padEmptyTaskItems(state: CoreState): void {
	const tokens = state.tokens;
	for (let i = 2; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok.type !== 'inline') continue;
		const m = EMPTY_MARK.exec(tok.content);
		if (!m) continue;
		if (tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open')
			continue;
		tok.content = `[${m[1]}] `;
	}
}

export const EmptyTaskItems = Extension.create({
	name: 'emptyTaskItems',
	addStorage() {
		return {
			markdown: {
				parse: {
					setup(md: MarkdownIt) {
						// Before 'inline', so the pad is in place when the task-lists
						// plugin (which runs after 'inline') checks the content.
						md.core.ruler.before('inline', 'empty_task_items', padEmptyTaskItems as never);
					}
				}
			}
		};
	}
});
