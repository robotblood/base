// Shared money math for the Overview pulse and the Money page — one source
// for "which month is current", the six-month cashflow, and the recurring
// load, so the two surfaces can't disagree about the same dollars.
import type { Item } from '$lib/types';

export const num = (v: unknown): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};
export const day = (v: unknown): string | null =>
	v == null || v === '' ? null : String(v).slice(0, 10);

// Rows planted by scripts/seed_assist_fixtures.py exist to exercise the
// assist rules, not to be money — every real surface reads past them.
export const real = (rows: Item[]): Item[] =>
	rows.filter((r) => !((r.tags as string[] | null) ?? []).includes('assist-fixture'));

// What a budget line costs per month. One-offs are excluded — they're a
// spend, not a rate.
export const MONTHLY_FACTOR: Record<string, number> = {
	Weekly: 52 / 12,
	Monthly: 1,
	Quarterly: 1 / 3,
	Yearly: 1 / 12
};

export interface MoneyPulse {
	monthLabel: string; // "August" — or the latest month with data
	monthLong: string; // "August 2026"
	monthPrefix: string; // "2026-08" — the same month, ready for date matching
	stale: boolean;
	income: number;
	expense: number;
	net: number;
	// Oldest→newest, ending at the label month: the pulse bars and net spark.
	months: { label: string; income: number; expense: number }[];
	recurring: number;
	unpaid: number;
}

// In/out per month ending at the newest month with data. Callers pass raw
// lists; fixtures are filtered here so no surface can forget to.
export function moneyPulse(allTxns: Item[], allBudgets: Item[]): MoneyPulse {
	const txns = real(allTxns);
	const budgets = real(allBudgets);
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	let prefix = `${now.getFullYear()}-${p(now.getMonth() + 1)}`;
	let stale = false;
	if (!txns.some((t) => day(t.occurred_on)?.startsWith(prefix))) {
		const latest = txns.map((t) => day(t.occurred_on)).filter(Boolean).sort().at(-1);
		if (latest) {
			prefix = latest.slice(0, 7);
			stale = true;
		}
	}
	const months: MoneyPulse['months'] = [];
	const anchor = new Date(`${prefix}-01T00:00:00`);
	for (let i = 5; i >= 0; i--) {
		const m = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
		const mp = `${m.getFullYear()}-${p(m.getMonth() + 1)}`;
		const rows = txns.filter((t) => day(t.occurred_on)?.startsWith(mp));
		const sum = (kind: string) =>
			rows.filter((t) => String(t.kind ?? '') === kind).reduce((s, t) => s + num(t.amount), 0);
		months.push({
			label: m.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
			income: sum('income'),
			expense: sum('expense')
		});
	}
	const latest = months.at(-1)!;
	const recurringRows = budgets.filter((b) => MONTHLY_FACTOR[String(b.frequency ?? '')] != null);
	return {
		monthLabel: anchor.toLocaleDateString('en-US', { month: 'long' }),
		monthLong: anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
		monthPrefix: prefix,
		stale,
		income: latest.income,
		expense: latest.expense,
		net: latest.income - latest.expense,
		months,
		recurring: recurringRows.reduce(
			(s, b) => s + num(b.amount) * MONTHLY_FACTOR[String(b.frequency ?? '')],
			0
		),
		unpaid: recurringRows.filter((b) => !b.paid).length
	};
}
