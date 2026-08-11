import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { day, MONTHLY_FACTOR, moneyPulse, num, real, type MoneyPulse } from '$lib/server/money';
import type { Item } from '$lib/types';

// The Money category page: the month's flow, six months of cashflow, the
// recurring load, and stock state. Rollups only — the tables are one
// drill-down away. Assist hints ride on budgets the rules lane has flagged;
// the flag itself lives in the suggestions queue, never here.

const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

export interface MoneyTxn {
	id: number;
	name: string;
	amount: number;
	kind: string | null; // income | expense
	occurred_on: string | null;
	category: string | null;
	barPct: number; // amount relative to the biggest row shown
}

export interface MoneyBudget {
	id: number;
	name: string;
	amount: number;
	frequency: string | null;
	paid: boolean;
	last_paid: string | null;
	spentPct: number | null; // matched spend this month / amount, null = no match
	hint: string | null; // a pending budget_trend suggestion's provenance
}

export interface MoneyMerch {
	id: number;
	name: string;
	stock: number;
	low_at: number | null;
}

export const load: PageServerLoad = async () => {
	let error: string | null = null;
	let txnsAll: Item[] = [];
	let budgetsAll: Item[] = [];
	let merch: Item[] = [];
	let pendingSugg: Item[] = [];
	try {
		[txnsAll, budgetsAll, merch, pendingSugg] = await Promise.all([
			api.list('transactions'),
			api.list('budgets'),
			api.list('merch'),
			api.assistSuggestions('pending').catch((): Item[] => [])
		]);
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}
	const txns = real(txnsAll);
	const budgets = real(budgetsAll);
	const pulse: MoneyPulse = moneyPulse(txnsAll, budgetsAll);
	const monthPrefix = pulse.monthPrefix;

	const recentRaw = [...txns]
		.sort((a, b) => String(day(b.occurred_on) ?? '').localeCompare(String(day(a.occurred_on) ?? '')))
		.slice(0, 8);
	const biggest = Math.max(...recentRaw.map((t) => num(t.amount)), 1);
	const recent: MoneyTxn[] = recentRaw.map((t) => ({
		id: t.id as number,
		name: String(t.name ?? ''),
		amount: num(t.amount),
		kind: str(t.kind),
		occurred_on: day(t.occurred_on),
		category: str(t.category),
		barPct: Math.max(4, Math.round((100 * num(t.amount)) / biggest))
	}));

	// A budget's month: expenses whose name or category mention it. Best
	// effort by construction — an unmatched budget shows no bar rather than a
	// confident zero.
	const monthRows = txns.filter(
		(t) => day(t.occurred_on)?.startsWith(monthPrefix) && String(t.kind ?? '') === 'expense'
	);
	const spentFor = (name: string): number | null => {
		const needle = name.toLowerCase();
		const hits = monthRows.filter(
			(t) =>
				String(t.name ?? '').toLowerCase().includes(needle) ||
				String(t.category ?? '').toLowerCase() === needle
		);
		return hits.length ? hits.reduce((s, t) => s + num(t.amount), 0) : null;
	};

	// Pending budget_trend suggestions, keyed by the budget they'd write to —
	// the amber chip that walks you to /assist.
	const hints = new Map<number, string>();
	for (const s of pendingSugg) {
		const action = (s.action ?? {}) as { op?: string; id?: number };
		if (action.op === 'budgets.set_amount' && typeof action.id === 'number')
			hints.set(action.id, String(s.why ?? s.title ?? ''));
	}

	const budgetRows: MoneyBudget[] = [...budgets]
		.sort((a, b) => num(b.amount) - num(a.amount))
		.map((b) => {
			const spent = MONTHLY_FACTOR[String(b.frequency ?? '')] === 1 ? spentFor(String(b.name)) : null;
			return {
				id: b.id as number,
				name: String(b.name ?? ''),
				amount: num(b.amount),
				frequency: str(b.frequency),
				paid: Boolean(b.paid),
				last_paid: day(b.last_paid),
				spentPct: spent != null && num(b.amount) > 0 ? Math.round((100 * spent) / num(b.amount)) : null,
				hint: hints.get(b.id as number) ?? null
			};
		});

	const lowStock: MoneyMerch[] = merch
		.filter((m) => m.low_stock_at != null && num(m.stock) <= num(m.low_stock_at))
		.map((m) => ({
			id: m.id as number,
			name: String(m.name ?? ''),
			stock: num(m.stock),
			low_at: num(m.low_stock_at)
		}));
	const stockValue = merch.reduce((s, m) => s + num(m.stock) * num(m.price), 0);

	return {
		error,
		pulse,
		recent,
		budgetRows,
		merch: { items: merch.length, stockValue, lowStock }
	};
};
