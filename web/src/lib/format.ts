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

/**
 * Timestamp-level "how long ago" — whole-day buckets are too coarse for a
 * trail meant to say "you were just here". `updated_at` comes back
 * timezone-naive but is stamped in UTC; parsed as-is the browser would read it
 * as local time and everything would look hours younger than it is.
 */
export function relTime(iso: string | null | undefined): string {
	if (!iso) return '';
	const utc = /[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
	const mins = Math.round((Date.now() - new Date(utc).getTime()) / 60000);
	if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
	if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
	const day = Math.round(mins / (60 * 24));
	return day === 1 ? 'yesterday' : `${day}d ago`;
}
