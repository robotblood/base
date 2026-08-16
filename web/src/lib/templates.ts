// Markdown templates: authored on Admin → Templates, stored whole in the
// `templates` settings blob (no schema — same pattern as the design tokens),
// and inserted from the editor's "/" menu. This module is the client-side
// registry: the root layout load fills it on every navigation, slash.ts reads
// it when the menu opens. Both sides of SvelteKit run setTemplates(), so SSR
// and the browser agree.

export type MdTemplate = {
	id: string;
	name: string;
	body: string;
};

/** The settings blob is user-shaped JSON — accept only well-formed entries
 *  rather than trusting the whole payload. */
export function normalizeTemplates(raw: unknown): MdTemplate[] {
	const list = (raw as { templates?: unknown } | null)?.templates;
	if (!Array.isArray(list)) return [];
	return list.flatMap((t) => {
		if (!t || typeof t !== 'object') return [];
		const { id, name, body } = t as Record<string, unknown>;
		if (typeof id !== 'string' || typeof name !== 'string' || typeof body !== 'string') return [];
		return [{ id, name, body }];
	});
}

let TEMPLATES: MdTemplate[] = [];

export function setTemplates(raw: unknown): void {
	TEMPLATES = normalizeTemplates(raw);
}

export function getTemplates(): MdTemplate[] {
	return TEMPLATES;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Fill-ins resolved at insert time, not save time — a meeting template's
 *  {{date}} should be the meeting's date. Local time on purpose: these land
 *  in prose, and "the 12th" must not become the 13th after 5pm (UTC skew). */
export const TEMPLATE_FILLS = ['date', 'time', 'weekday'] as const;

export function expandTemplate(body: string, now = new Date()): string {
	const fills: Record<string, string> = {
		date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
		weekday: now.toLocaleDateString('en-US', { weekday: 'long' })
	};
	return body.replace(/\{\{\s*(date|time|weekday)\s*\}\}/gi, (_, k) => fills[k.toLowerCase()]);
}
