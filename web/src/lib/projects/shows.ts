// Presentation helpers for live shows (the Shows ledger + Show Details
// dashboard, per the Live Productions design handoff). A show is a Calendar
// event of kind 'performance': venue = title, city = location, production
// data = the events.show doc (see ShowDoc in ./data).
import type { ProjEvent, ShowDoc } from './data';

// Status pill: [text/dot color, soft background]. Midtone hexes from the
// handoff's token table — legible on both the Paper and Console themes.
export const SHOW_STATUS: Record<string, [string, string]> = {
	Confirmed: ['#63c088', 'rgba(99,192,136,0.14)'],
	Advancing: ['#e6a03b', 'rgba(230,160,59,0.14)'],
	Announced: ['#6ea8e6', 'rgba(110,168,230,0.15)'],
	Cancelled: ['#e0645c', 'rgba(224,100,92,0.14)'],
	Completed: ['#8a8a8f', 'rgba(138,138,143,0.13)']
};

export const ADVANCE_STYLE: Record<string, [string, string]> = {
	Advanced: ['#63c088', 'rgba(99,192,136,0.14)'],
	Pending: ['#e6a03b', 'rgba(230,160,59,0.14)'],
	Confirmed: ['#6ea8e6', 'rgba(110,168,230,0.15)']
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dateOf = (when: string): Date | undefined => {
	if (!when) return undefined;
	const d = new Date(when.length <= 10 ? `${when}T00:00` : when);
	return isNaN(d.getTime()) ? undefined : d;
};

// "WED" / "Oct 1" — the ledger's date block.
export function showDow(when: string): string {
	const d = dateOf(when);
	return d ? DOW[d.getDay()] : '—';
}
export function showDate(when: string): string {
	const d = dateOf(when);
	return d ? `${MON[d.getMonth()]} ${d.getDate()}` : 'TBD';
}
// "Wed · Oct 1, 2026" — the dashboard subtitle.
export function showDateLong(when: string): string {
	const d = dateOf(when);
	return d
		? `${DOW_LONG[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
		: 'Date TBD';
}

// Status falls back by date when unset: past shows read Completed, future
// ones Announced (the pipeline's entry state).
export function showStatus(ev: { status: string; when: string }, todayISO: string): string {
	if (ev.status) return ev.status;
	return ev.when && ev.when.slice(0, 10) < todayISO ? 'Completed' : 'Announced';
}

export const fmtMoney = (n: number | undefined): string =>
	n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;

// "312/400", "On sale" before any sales, "—" with no capacity.
export function soldShort(s: ShowDoc | undefined): string {
	if (!s?.capacity) return s?.sold ? String(s.sold) : '—';
	return s.sold ? `${s.sold}/${s.capacity}` : 'On sale';
}

// The 8-cell metrics grid in an expanded ledger row.
export function showMetrics(s: ShowDoc | undefined, advance: string): { k: string; v: string }[] {
	return [
		{ k: 'Doors', v: s?.doors || '—' },
		{ k: 'Set', v: s?.set || '—' },
		{ k: 'Load-in', v: s?.loadIn || '—' },
		{ k: 'Load-out', v: s?.loadOut || '—' },
		{ k: 'Capacity', v: s?.capacity != null ? String(s.capacity) : '—' },
		{ k: 'Sold', v: soldShort(s) },
		{ k: 'Gross', v: fmtMoney(s?.gross) },
		{ k: 'Advance', v: advance || '—' }
	];
}

// Settlement value tone is presentation-derived, never stored: comparison
// rows read positive (green), the projected payout reads accent (amber).
export function settlementTone(label: string): 'good' | 'accent' | undefined {
	if (/projected|payout/i.test(label)) return 'accent';
	if (/vs\.|net/i.test(label)) return 'good';
	return undefined;
}

// Shows of a project = its performances, in date order (undated last).
export function showsOf(events: ProjEvent[]): ProjEvent[] {
	return events
		.filter((e) => e.kind === 'performance')
		.sort((a, b) => (a.when || '9999') < (b.when || '9999') ? -1 : 1);
}
