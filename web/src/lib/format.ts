// Display formatting — port of tui/dashboard.py `fmt()`.
// null/undefined -> "", lists -> comma-joined, ISO datetimes -> trimmed.

// "2026-09-28T18:00:00", with or without fractional seconds or a zone — the
// shape the API returns for datetime columns.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/;

export function fmt(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
	const s = String(value);
	// Only reshape values that really are datetimes. The test used to be
	// "contains a T and is at least 19 characters", which quietly mangled any
	// ordinary text that happened to qualify: "Robotblood - Fall Tour" rendered
	// as "Robotblood - Fall " — first T swapped for a space, then cut to 19.
	if (ISO_DATETIME.test(s)) return s.replace('T', ' ').slice(0, 19);
	return s;
}
