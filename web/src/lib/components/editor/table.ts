// Tables round-trip as GFM. tiptap-markdown ships a table serializer already,
// but it writes cell text straight into the row: a literal "|" typed in a cell
// reparses as a column break, so the table quietly gains a column on the next
// autosave. It also drops any table it considers unserialisable rather than
// degrading it. This override fixes both.
import { Table, escapeTableCellPipes } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';

// The slice of MarkdownSerializerState this serializer touches. `out` is the
// accumulating output string — rendering a cell and then rewinding it is how
// each cell's markdown is captured for escaping.
interface SerializerState {
	out: string;
	renderInline: (node: PMNode) => void;
	closeBlock: (node: PMNode) => void;
	ensureNewLine: () => void;
	write: (s: string) => void;
	inTable: boolean;
}

const children = (node: PMNode): PMNode[] => {
	const out: PMNode[] = [];
	node.forEach((child) => out.push(child));
	return out;
};

// Every pipe a cell contains has to be escaped, or the row splits there when
// the note is read back. `escapeTableCellPipes` only covers the ones inside
// code spans (where the usual backslash escape isn't available), so this picks
// up the rest without double-escaping its work.
const escapePipes = (s: string) => s.replace(/\\?\|/g, (m) => (m === '\\|' ? m : '\\|'));

// A cell's markdown, flattened to one line. GFM cells hold inline content
// only, so a multi-block cell (someone hit Enter mid-cell) joins with a space
// rather than losing its later blocks.
function renderCell(state: SerializerState, cell: PMNode): string {
	const start = state.out.length;
	children(cell).forEach((block, i) => {
		if (i) state.out += ' ';
		state.renderInline(block);
	});
	const text = state.out.slice(start);
	state.out = state.out.slice(0, start);
	return escapePipes(escapeTableCellPipes(text.replace(/\s*\n+\s*/g, ' '))).trim();
}

export const MarkdownTable = Table.extend({
	addStorage() {
		return {
			...this.parent?.(),
			markdown: {
				serialize(state: SerializerState, node: PMNode) {
					// Close out the previous block before any cell is rendered.
					// Rendering a cell flushes that pending separator too, and the
					// rewind in renderCell would take the blank line with it — leaving
					// the table welded onto the paragraph above.
					state.write('');

					const rows = children(node).map((row) => ({
						cells: children(row).map((cell) => renderCell(state, cell)),
						isHeader: children(row).every((cell) => cell.type.name === 'tableHeader')
					}));
					if (!rows.length) return;

					// Merged cells only ever arrive by paste — nothing in the editor
					// creates them. Pad the grid out to the widest row so the content
					// still survives as a plain table instead of being dropped; the
					// merge itself is not expressible in GFM.
					const width = Math.max(...rows.map((r) => r.cells.length));
					const line = (cells: string[]) =>
						`| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;

					state.inTable = true;
					// GFM has no way to say "no header", so a headerless table is
					// written with an empty one and stripped again by updateDOM below.
					const [first, ...rest] = rows;
					const body = first.isHeader ? rest : rows;
					state.write(line(first.isHeader ? first.cells : []));
					state.ensureNewLine();
					state.write(`| ${Array.from({ length: width }, () => '---').join(' | ')} |`);
					state.ensureNewLine();
					for (const row of body) {
						state.write(line(row.cells));
						state.ensureNewLine();
					}
					state.closeBlock(node);
					state.inTable = false;
				},
				parse: {
					updateDOM(element: HTMLElement) {
						// The other half of the headerless case above. A table whose
						// header cells are all blank reads as headerless either way, so
						// nothing distinguishable is lost by treating it as one.
						element.querySelectorAll('table > thead').forEach((thead) => {
							const cells = Array.from(thead.querySelectorAll('th'));
							if (cells.length && cells.every((c) => !c.textContent?.trim())) thead.remove();
						});
					}
				}
			}
		};
	}
});
