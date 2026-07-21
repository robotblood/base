import type { FieldSpec } from '$lib/types';

// Convert a submitted <form> (all string values) into the typed JSON payload
// the FastAPI / SQLModel backend expects: numbers, dates, datetimes, booleans,
// and string[] tags. Empty text fields are omitted so PATCH leaves them alone.
export function coerce(fields: FieldSpec[], form: FormData): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of fields) {
		const raw = form.get(f.name);

		// Checkbox: absent (unchecked) -> false, present -> true. Always sent.
		if (f.type === 'checkbox') {
			out[f.name] = raw != null && raw !== 'false';
			continue;
		}

		// Relation: a foreign record id. Always sent — empty ('— None —') clears
		// the link (null) rather than being omitted, so a link can be removed.
		if (f.type === 'relation') {
			if (raw == null) continue;
			const s = String(raw).trim();
			const n = Number(s);
			out[f.name] = s === '' || Number.isNaN(n) ? null : n;
			continue;
		}

		// Tags: always sent (empty -> []) so the field can be cleared.
		if (f.type === 'tags') {
			if (raw == null) continue;
			out[f.name] = String(raw)
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			continue;
		}

		if (raw == null) continue;
		const s = String(raw).trim();
		if (s === '') continue; // omit empty scalars

		switch (f.type) {
			case 'number': {
				const n = Number(s);
				if (!Number.isNaN(n)) out[f.name] = n;
				break;
			}
			case 'datetime': {
				// <input type="datetime-local"> yields "YYYY-MM-DDTHH:MM"; add seconds.
				out[f.name] = s.length === 16 ? `${s}:00` : s;
				break;
			}
			default:
				out[f.name] = s;
		}
	}
	return out;
}
