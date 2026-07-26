// Presentation helpers for live shows (the Shows ledger + Show Details
// dashboard, per the Live Productions design handoff). A show is a Calendar
// event of kind 'performance': venue = title, city = location, production
// data = the events.show doc (see ShowDoc in ./data).
import type { MerchCount, ProjEvent, ShowDoc } from './data';

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

// ——— Merch ————————————————————————————————————————————————————————————
// Sold is derived from the physical count, never typed: what went in, minus
// what came back, minus what was given away. An unfinished count (no `out`
// yet) reads as nothing sold rather than as the whole load-in.
export function merchSold(m: MerchCount): number {
	if (m.out == null) return 0;
	return Math.max(0, (m.in ?? 0) - m.out - (m.comp ?? 0));
}
export const merchRevenue = (m: MerchCount): number => merchSold(m) * (m.price ?? 0);
// True once every line has been counted out — the sheet is reconciled and
// safe to push into inventory.
export const merchCounted = (rows: MerchCount[] | undefined): boolean =>
	!!rows?.length && rows.every((m) => m.out != null);

// ——— Settlement ———————————————————————————————————————————————————————
// The night's money, computed from deal terms rather than typed. Every field
// is dollars except `splitPct`.
export interface Settlement {
	gross: number; // box office
	expenses: number;
	net: number; // gross - expenses
	guarantee: number;
	splitPct: number;
	splitEarn: number; // splitPct% of net
	overage: number; // how much the split beats the guarantee by (0 if it doesn't)
	ticketTake: number; // max(guarantee, splitEarn) — the standard vs. deal
	merchGross: number;
	merchToVenue: number;
	merchNet: number;
	payout: number; // ticketTake + merchNet
}
export function settle(doc: ShowDoc | undefined): Settlement {
	const deal = doc?.deal ?? {};
	const gross = doc?.gross ?? 0;
	const expenses = (deal.expenses ?? []).reduce((sum, e) => sum + (e.amount || 0), 0);
	const net = Math.max(0, gross - expenses);
	const guarantee = deal.guarantee ?? 0;
	const splitPct = deal.split ?? 0;
	const splitEarn = Math.round((net * splitPct) / 100);
	const ticketTake = Math.max(guarantee, splitEarn);
	const merchGross = (doc?.merch ?? []).reduce((sum, m) => sum + merchRevenue(m), 0);
	const merchToVenue = Math.round((merchGross * (deal.merchRate ?? 0)) / 100);
	const merchNet = merchGross - merchToVenue;
	return {
		gross,
		expenses,
		net,
		guarantee,
		splitPct,
		splitEarn,
		overage: Math.max(0, splitEarn - guarantee),
		ticketTake,
		merchGross,
		merchToVenue,
		merchNet,
		payout: ticketTake + merchNet
	};
}
// A show settles once terms exist; before that the dashboard shows whatever
// was typed into the old free-form list instead.
export const hasDeal = (doc: ShowDoc | undefined): boolean =>
	!!doc?.deal && Object.keys(doc.deal).length > 0;

// Run totals across a tour — the ledger's summary strip.
export function tourTotals(docs: (ShowDoc | undefined)[]) {
	return docs.reduce(
		(acc, doc) => {
			const s = settle(doc);
			acc.gross += s.gross;
			acc.merch += s.merchGross;
			acc.payout += hasDeal(doc) ? s.payout : 0;
			acc.sold += doc?.sold ?? 0;
			acc.capacity += doc?.capacity ?? 0;
			return acc;
		},
		{ gross: 0, merch: 0, payout: 0, sold: 0, capacity: 0 }
	);
}

// Shows of a project = its performances, in date order (undated last).
export function showsOf(events: ProjEvent[]): ProjEvent[] {
	return events
		.filter((e) => e.kind === 'performance')
		.sort((a, b) => (a.when || '9999') < (b.when || '9999') ? -1 : 1);
}
