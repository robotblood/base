// The note "font specimen": a line of text rendered in a typeface from the
// library ($lib/design/typefaces), stored in the markdown body as one
// constrained HTML shape — `<div class="specimen" data-face="…">TEXT</div>` —
// the same pattern as the note button. The raw md tab stays readable, and
// MarkdownDoc renders it with no custom parser on the read side; the face id →
// font-family mapping lives in typefaces.css, shared by both sides.
//
// The block's text *is* the sample: click in and type. The face and size
// controls float above the block while the cursor is inside it (the node view
// tracks selectionUpdate — :focus-within can't work here, focus always sits on
// the ProseMirror root), so a note full of specimens reads as type, not forms.
import { Node, mergeAttributes } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TYPEFACES } from '$lib/design/typefaces';
import '$lib/design/typefaces.css';

export interface SpecimenAttrs {
	face: string;
	size: number;
	/** '' = undecided; the block is also a decision the note remembers. */
	status: '' | 'approved' | 'rejected';
}

// Only faces with a bundled file can render in a note. Commercial entries
// stay gallery-only, where the no-specimen state can explain itself.
export const RENDERABLE = TYPEFACES.filter((t) => t.family !== null);

export const SPECIMEN_DEFAULTS: SpecimenAttrs = {
	face: RENDERABLE[0]?.id ?? 'archivo',
	size: 46,
	status: ''
};

const STATUSES = ['approved', 'rejected'] as const;

const asStatus = (v: unknown): SpecimenAttrs['status'] =>
	STATUSES.includes(v as (typeof STATUSES)[number]) ? (v as SpecimenAttrs['status']) : '';

const SIZE = { min: 16, max: 120 };

const clampSize = (v: unknown): number => {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? Math.min(SIZE.max, Math.max(SIZE.min, n)) : SPECIMEN_DEFAULTS.size;
};

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		fontSpecimen: {
			insertFontSpecimen: () => ReturnType;
			updateFontSpecimenAt: (pos: number, attrs: Partial<SpecimenAttrs>) => ReturnType;
		};
	}
}

function domAttrs(a: SpecimenAttrs): Record<string, string> {
	const out: Record<string, string> = {
		class: 'specimen',
		'data-face': a.face,
		// Inline so the read side sizes without CSS being able to read the
		// attribute; the editor parses it back out of style.
		style: `font-size:${clampSize(a.size)}px`
	};
	// Only written once a verdict exists, so an undecided block stays clean in
	// the raw md — and the read side badges from the same attribute.
	if (a.status) out['data-status'] = a.status;
	return out;
}

const escapeText = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function specimenToHtml(a: SpecimenAttrs, text: string): string {
	const attrs = Object.entries(domAttrs(a))
		.map(([k, v]) => `${k}="${v}"`)
		.join(' ');
	return `<div ${attrs}>${escapeText(text)}</div>`;
}

// Tolerant of the raw md tab, like the button: any attribute order, either
// quote style. Single line only — that's the shape the serializer writes.
const OPEN_RE = /^<div\s[^>]*class=["'][^"']*\bspecimen\b[^"']*["'][^>]*>[\s\S]*<\/div>\s*$/i;

type BlockState = {
	src: string;
	bMarks: number[];
	eMarks: number[];
	tShift: number[];
	line: number;
	push: (t: string, g: string, n: number) => { content: string; map: [number, number] | null };
};

function specimenRule(
	state: BlockState,
	startLine: number,
	_endLine: number,
	silent: boolean
): boolean {
	const pos = state.bMarks[startLine] + state.tShift[startLine];
	const line = state.src.slice(pos, state.eMarks[startLine]);
	if (!OPEN_RE.test(line)) return false;
	if (!silent) {
		// Verbatim html_block: the renderer honours it regardless of the
		// markdown-it `html` option (that gates parser rules, not this), so one
		// HTML shape passes while everything else keeps escaping.
		const token = state.push('html_block', '', 0);
		token.content = line + '\n';
		token.map = [startLine, startLine + 1];
	}
	state.line = startLine + 1;
	return true;
}

export const FontSpecimenBlock = Node.create({
	name: 'fontSpecimen',
	group: 'block',
	content: 'text*',
	marks: '',
	// `code` keeps input rules from firing inside the sample ("# " must not
	// become a heading) and gives exitCode() something to exit from.
	code: true,
	defining: true,

	addAttributes() {
		return {
			face: { default: SPECIMEN_DEFAULTS.face },
			size: { default: SPECIMEN_DEFAULTS.size },
			status: { default: SPECIMEN_DEFAULTS.status }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'div.specimen',
				priority: 100,
				getAttrs: (el) => {
					const d = el as HTMLElement;
					const size = /font-size:\s*(\d+(?:\.\d+)?)px/i.exec(d.getAttribute('style') ?? '');
					return {
						face: d.getAttribute('data-face') ?? SPECIMEN_DEFAULTS.face,
						size: clampSize(size?.[1] ?? SPECIMEN_DEFAULTS.size),
						status: asStatus(d.getAttribute('data-status'))
					};
				}
			}
		];
	},

	renderHTML({ node }) {
		return ['div', mergeAttributes(domAttrs(node.attrs as SpecimenAttrs)), 0];
	},

	addKeyboardShortcuts() {
		return {
			// The sample is one line; Enter leaves the block instead of growing it.
			Enter: () => this.editor.commands.exitCode()
		};
	},

	addNodeView() {
		return ({ node, getPos, editor }) => {
			let current = node;

			const dom = document.createElement('div');
			dom.className = 'specimen-node';

			// Controls: hidden until the cursor is inside (CSS :focus-within).
			const controls = document.createElement('div');
			controls.className = 'specimen-controls';
			controls.contentEditable = 'false';

			const apply = (attrs: Partial<SpecimenAttrs>) => {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos != null) editor.commands.updateFontSpecimenAt(pos, attrs);
			};

			const select = document.createElement('select');
			for (const f of RENDERABLE) {
				const opt = document.createElement('option');
				opt.value = f.id;
				opt.textContent = f.name;
				select.append(opt);
			}
			select.value = current.attrs.face;
			select.addEventListener('change', () => apply({ face: select.value }));

			const size = document.createElement('input');
			size.type = 'range';
			size.min = String(SIZE.min);
			size.max = String(SIZE.max);
			size.value = String(current.attrs.size);
			const sizeOut = document.createElement('span');
			sizeOut.textContent = `${current.attrs.size}px`;
			size.addEventListener('input', () => apply({ size: clampSize(size.value) }));

			// The verdict: the block is also the decision surface. Clicking the
			// active verdict again withdraws it (back to undecided).
			const verdictBtn = (label: string, status: SpecimenAttrs['status']) => {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'specimen-verdict';
				b.dataset.verdict = status;
				b.textContent = label;
				b.addEventListener('click', () =>
					apply({ status: current.attrs.status === status ? '' : status })
				);
				return b;
			};
			const approve = verdictBtn('✓ approve', 'approved');
			const reject = verdictBtn('✗ reject', 'rejected');

			controls.append(select, size, sizeOut, approve, reject);

			const content = document.createElement('div');
			content.className = 'specimen';
			content.dataset.face = current.attrs.face;
			content.style.fontSize = `${clampSize(current.attrs.size)}px`;

			const reflect = (attrs: SpecimenAttrs) => {
				if (attrs.status) content.dataset.status = attrs.status;
				else delete content.dataset.status;
				approve.classList.toggle('is-on', attrs.status === 'approved');
				reject.classList.toggle('is-on', attrs.status === 'rejected');
			};
			reflect(current.attrs as SpecimenAttrs);

			dom.append(controls, content);

			// Controls show while the selection sits inside this node. Focus
			// never lands on inner nodes of a contenteditable, so CSS focus
			// tricks can't answer "is the cursor in here" — the editor can.
			const onSelection = () => {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos == null) return;
				const { from, to } = editor.state.selection;
				const inside = editor.isFocused && from >= pos && to <= pos + current.nodeSize;
				dom.classList.toggle('is-active', inside);
			};
			editor.on('selectionUpdate', onSelection);
			editor.on('focus', onSelection);
			editor.on('blur', onSelection);

			return {
				dom,
				contentDOM: content,
				stopEvent: (e: Event) => controls.contains(e.target as globalThis.Node),
				ignoreMutation: (m: { target: globalThis.Node }) => !content.contains(m.target),
				destroy() {
					editor.off('selectionUpdate', onSelection);
					editor.off('focus', onSelection);
					editor.off('blur', onSelection);
				},
				update(updated: PMNode) {
					if (updated.type.name !== 'fontSpecimen') return false;
					current = updated;
					content.dataset.face = updated.attrs.face;
					content.style.fontSize = `${clampSize(updated.attrs.size)}px`;
					select.value = updated.attrs.face;
					size.value = String(updated.attrs.size);
					sizeOut.textContent = `${updated.attrs.size}px`;
					reflect(updated.attrs as SpecimenAttrs);
					return true;
				}
			};
		};
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
					node: PMNode
				) {
					state.write(specimenToHtml(node.attrs as SpecimenAttrs, node.textContent));
					state.closeBlock(node);
				},
				parse: {
					setup(markdownit: MarkdownIt) {
						markdownit.block.ruler.before('html_block', 'font_specimen', specimenRule as never);
					}
				}
			}
		};
	},

	addCommands() {
		return {
			insertFontSpecimen:
				() =>
				({ chain }) =>
					chain()
						.insertContent({
							type: this.name,
							attrs: { ...SPECIMEN_DEFAULTS },
							content: [{ type: 'text', text: 'ROBOTBLOOD' }]
						})
						.run(),

			updateFontSpecimenAt:
				(pos, attrs) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos);
					if (!node || node.type.name !== this.name) return false;
					if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
					return true;
				}
		};
	}
});
