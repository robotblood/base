// The note "button": a call-to-action stored in the markdown body as a plain
// anchor with `class="btn"`, so the raw md tab stays readable and MarkdownDoc
// renders it with no custom parser on the read side.
//
// The editor deliberately keeps markdown-it's `html: false`. Turning HTML on
// wholesale would swallow the placeholder angle brackets that already live in
// these notes ("kill <PID>", "<module>/<root>") — the DOM parser drops unknown
// tags, and the next autosave would write the shortened body back. Instead the
// one shape below gets its own inline rule; everything else stays escaped text.
//
// `data-kind` is carried through untouched and is always "link" today. Action
// buttons (create a record, flip a status) can land as a second kind later
// without a migration: existing notes already say what they are.
import { Node, mergeAttributes } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';

export type ButtonVariant = 'primary' | 'secondary';

export interface NoteButtonAttrs {
	label: string;
	href: string;
	kind: string;
	variant: ButtonVariant;
}

export interface NoteButtonOptions {
	// Opens the settings dialog. `pos` is the document position of the button,
	// so the dialog can write back to that exact node.
	onEdit?: (attrs: NoteButtonAttrs, pos: number, isNew: boolean) => void;
	// Follows the button. A note's body is only ever shown in this editor, so
	// without this a button would be decorative everywhere it actually lives.
	onOpen?: (href: string) => void;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		noteButton: {
			insertNoteButton: () => ReturnType;
			updateNoteButtonAt: (pos: number, attrs: Partial<NoteButtonAttrs>) => ReturnType;
			removeNoteButtonAt: (pos: number) => ReturnType;
		};
	}
}

export const BUTTON_DEFAULTS: NoteButtonAttrs = {
	label: 'Button',
	href: '',
	kind: 'link',
	variant: 'primary'
};

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

/** Targets that leave the app, and so want a new tab. */
export function isExternal(href: string): boolean {
	return EXTERNAL.test(href.trim());
}

function domAttrs(a: NoteButtonAttrs): Record<string, string> {
	const out: Record<string, string> = {
		class: 'btn',
		'data-kind': a.kind || 'link',
		'data-variant': a.variant || 'primary',
		href: a.href || '#'
	};
	// Written into the stored markdown rather than applied at render time —
	// MarkdownDoc passes the anchor through verbatim, so the behaviour has to
	// travel with it.
	if (isExternal(a.href)) {
		out.target = '_blank';
		out.rel = 'noreferrer';
	}
	return out;
}

const escapeAttr = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeText = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buttonToHtml(a: NoteButtonAttrs): string {
	const attrs = Object.entries(domAttrs(a))
		.map(([k, v]) => `${k}="${escapeAttr(v)}"`)
		.join(' ');
	return `<a ${attrs}>${escapeText(a.label || 'Button')}</a>`;
}

// Tolerant of hand-editing in the raw md tab: any attribute order, either
// quote style, extra classes alongside `btn`.
const BUTTON_RE = /^<a\s[^>]*class=["'][^"']*\bbtn\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;

function buttonRule(state: { src: string; pos: number; push: (t: string, g: string, n: number) => { content: string } }, silent: boolean): boolean {
	if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
	const match = BUTTON_RE.exec(state.src.slice(state.pos));
	if (!match) return false;
	if (!silent) {
		// `html_inline` is rendered verbatim regardless of markdown-it's `html`
		// option — that option gates the parser rules, not this renderer. Which
		// is how one HTML shape gets through while the rest of the document
		// keeps escaping its angle brackets.
		state.push('html_inline', '', 0).content = match[0];
	}
	state.pos += match[0].length;
	return true;
}

export const NoteButton = Node.create<NoteButtonOptions>({
	name: 'noteButton',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	// Beat StarterKit's Link mark to the same <a> element.
	priority: 1100,

	addOptions() {
		return { onEdit: undefined, onOpen: undefined };
	},

	addAttributes() {
		return {
			label: { default: BUTTON_DEFAULTS.label },
			href: { default: BUTTON_DEFAULTS.href },
			kind: { default: BUTTON_DEFAULTS.kind },
			variant: { default: BUTTON_DEFAULTS.variant }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'a.btn',
				priority: 100,
				getAttrs: (el) => {
					const a = el as HTMLElement;
					return {
						label: a.textContent?.trim() || BUTTON_DEFAULTS.label,
						href: a.getAttribute('href') ?? '',
						kind: a.getAttribute('data-kind') || 'link',
						variant: a.getAttribute('data-variant') === 'secondary' ? 'secondary' : 'primary'
					};
				}
			}
		];
	},

	renderHTML({ node }) {
		return ['a', mergeAttributes(domAttrs(node.attrs as NoteButtonAttrs)), node.attrs.label];
	},

	addNodeView() {
		return ({ node, getPos }) => {
			const dom = document.createElement('a');
			for (const [k, v] of Object.entries(domAttrs(node.attrs as NoteButtonAttrs))) {
				dom.setAttribute(k, v);
			}
			dom.textContent = node.attrs.label;
			dom.contentEditable = 'false';
			dom.title = 'Click to open · ⌘/Ctrl-click to edit';
			dom.addEventListener('click', (event) => {
				// The browser would follow the anchor itself, skipping the app's
				// unsaved-changes handling; route it through the host instead.
				event.preventDefault();
				const attrs = node.attrs as NoteButtonAttrs;
				const pos = typeof getPos === 'function' ? getPos() : null;
				// A button with nowhere to go opens its settings on a plain click —
				// otherwise it would be a dead end with no way back into the dialog.
				if (event.metaKey || event.ctrlKey || !attrs.href.trim()) {
					if (pos != null) this.options.onEdit?.(attrs, pos, false);
					return;
				}
				this.options.onOpen?.(attrs.href);
			});
			return { dom };
		};
	},

	addStorage() {
		return {
			markdown: {
				serialize(state: { text: (s: string, escape: boolean) => void }, node: { attrs: NoteButtonAttrs }) {
					state.text(buttonToHtml(node.attrs), false);
				},
				parse: {
					setup(markdownit: MarkdownIt) {
						markdownit.inline.ruler.before('autolink', 'note_button', buttonRule as never);
					}
				}
			}
		};
	},

	addCommands() {
		return {
			insertNoteButton:
				() =>
				({ chain }) =>
					chain()
						.insertContent({ type: this.name, attrs: { ...BUTTON_DEFAULTS } })
						.command(({ tr }) => {
							// Open the dialog on the button we just inserted, so a new one
							// is configured immediately rather than landing as a stub. An
							// inline atom is one position wide, hence `from - 1`.
							const pos = tr.selection.from - 1;
							const node = tr.doc.nodeAt(pos);
							if (node?.type.name === this.name) {
								this.options.onEdit?.(node.attrs as NoteButtonAttrs, pos, true);
							}
							return true;
						})
						.run(),

			updateNoteButtonAt:
				(pos, attrs) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos);
					if (!node || node.type.name !== this.name) return false;
					if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
					return true;
				},

			removeNoteButtonAt:
				(pos) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos);
					if (!node || node.type.name !== this.name) return false;
					if (dispatch) tr.delete(pos, pos + node.nodeSize);
					return true;
				}
		};
	}
});
