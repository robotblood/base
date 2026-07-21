// Display formatting — port of tui/dashboard.py `fmt()`.
// null/undefined -> "", lists -> comma-joined, ISO datetimes -> trimmed.

export function fmt(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
	const s = String(value);
	if (s.includes('T') && s.length >= 19) return s.replace('T', ' ').slice(0, 19);
	return s;
}
