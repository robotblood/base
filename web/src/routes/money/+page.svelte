<script lang="ts">
	// The Money category page — the month's flow up top, transactions with
	// their weight drawn on, six months of cashflow, budgets with real spend
	// bars, merch below. Assist hints appear on budgets the rules lane has
	// flagged; the chip walks to /assist, it never edits anything here.
	import type { PageData } from './$types';
	import { getModule } from '$lib/modules';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Zap from '@lucide/svelte/icons/zap';

	let { data }: { data: PageData } = $props();

	const txnMod = getModule('transactions')!;
	const budgetMod = getModule('budgets')!;

	const usd = (n: number) =>
		n.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
			maximumFractionDigits: 2
		});

	const shortDate = (iso: string | null) => {
		if (!iso) return '';
		const dt = new Date(iso + 'T00:00:00');
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};

	const flowMax = $derived(
		Math.max(...data.pulse.months.flatMap((m) => [m.income, m.expense]), 1)
	);

	const cardLabel = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
	const drill =
		'flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-signal';
</script>

<svelte:head><title>base — money</title></svelte:head>

<div class="max-w-[1420px] px-9 pb-14 pt-7">
	<PageHeader
		code="MONEY"
		title="Money"
		subtitle={`transactions · budgets · merch — ${data.pulse.monthLong.toLowerCase()}${
			data.pulse.stale ? ' (latest with data)' : ''
		}`}
	/>

	{#if data.error}
		<div
			class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.error}
		</div>
	{/if}

	<!-- The month's flow, then the standing load it has to clear. -->
	<div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
		<a href="/transactions" class="rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40">
			<div class={cardLabel}>In · {data.pulse.monthLabel}{data.pulse.stale ? ' *' : ''}</div>
			<div class="mt-1.5 font-mono text-[26px] font-bold tabular-nums tracking-tight" style="color:#2f7d5b;">
				{usd(data.pulse.income)}
			</div>
		</a>
		<a href="/transactions" class="rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40">
			<div class={cardLabel}>Out · {data.pulse.monthLabel}{data.pulse.stale ? ' *' : ''}</div>
			<div class="mt-1.5 font-mono text-[26px] font-bold tabular-nums tracking-tight" style="color:#b23a26;">
				{usd(data.pulse.expense)}
			</div>
		</a>
		<a href="/transactions" class="rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40">
			<div class={cardLabel}>Net</div>
			<div
				class={`mt-1.5 font-mono text-[26px] font-bold tabular-nums tracking-tight ${
					data.pulse.net < 0 ? 'text-destructive' : ''
				}`}
			>
				{usd(data.pulse.net)}
			</div>
		</a>
		<a
			href="/budgets"
			class={`rounded-[12px] border bg-card px-5 py-4 transition-colors hover:border-ring/40 ${
				data.pulse.unpaid > 0 ? 'border-signal/50' : ''
			}`}
		>
			<div class={cardLabel}>Recurring / month</div>
			<div class="mt-1.5 font-mono text-[26px] font-bold tabular-nums tracking-tight">
				{usd(data.pulse.recurring)}
			</div>
			{#if data.pulse.unpaid > 0}
				<div class="mt-1 font-mono text-[11px] text-signal">{data.pulse.unpaid} unpaid</div>
			{/if}
		</a>
	</div>

	<div class="grid items-start gap-4 lg:grid-cols-12">
		<!-- Latest movements, weight drawn on. -->
		<div class="overflow-hidden rounded-[12px] border bg-card lg:col-span-7">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<span class={cardLabel}>Recent transactions</span>
				<a href="/transactions" class={drill}>all transactions <ArrowRight class="size-3" /></a>
			</div>
			<div class="divide-y">
				{#each data.recent as t (t.id)}
					<a
						href={`/transactions/${t.id}`}
						class="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
					>
						<StatusDot mod={txnMod} value={t.kind} />
						<span class="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
						{#if t.category}
							<span class="flex-none font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground"
								>{t.category}</span
							>
						{/if}
						<span class="w-12 flex-none text-right font-mono text-[10px] text-muted-foreground"
							>{shortDate(t.occurred_on)}</span
						>
						<span
							class="w-[72px] flex-none text-right font-mono text-[11px] tabular-nums"
							style={`color:${t.kind === 'income' ? '#2f7d5b' : '#b23a26'};`}
						>
							{t.kind === 'income' ? '+' : '−'}{usd(t.amount)}
						</span>
						<span class="h-[3px] w-14 flex-none overflow-hidden rounded-full bg-border">
							<span
								class="block h-full"
								style={`width:${t.barPct}%;background:${t.kind === 'income' ? '#2f7d5b99' : '#b23a2699'};`}
							></span>
						</span>
					</a>
				{:else}
					<div class="px-5 py-4 text-sm text-muted-foreground">No transactions recorded.</div>
				{/each}
			</div>
		</div>

		<div class="flex min-w-0 flex-col gap-4 lg:col-span-5">
			<!-- Six months of cashflow, current month full strength. -->
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class={cardLabel}>Cashflow · 6 months</span>
					<span class="font-mono text-[10px] text-muted-foreground">
						<span style="color:#2f7d5b;">■</span> in
						<span style="color:#b23a26;">■</span> out
					</span>
				</div>
				<div class="flex h-[120px] items-end justify-around gap-2 px-4 pb-2 pt-4">
					{#each data.pulse.months as m, i (m.label)}
						{@const last = i === data.pulse.months.length - 1}
						{@const worse = m.expense > m.income}
						<div class="flex flex-col items-center gap-1.5">
							<div class="flex items-end gap-[3px]">
								<div
									class="w-[13px] rounded-t-[2px]"
									style={`height:${Math.max(2, (74 * m.income) / flowMax)}px;background:#2f7d5b${last ? '' : '66'};`}
								></div>
								<div
									class="w-[13px] rounded-t-[2px]"
									style={`height:${Math.max(2, (74 * m.expense) / flowMax)}px;background:#b23a26${last ? '' : '66'};`}
								></div>
							</div>
							<span
								class="font-mono text-[9px]"
								style={last
									? 'color:var(--signal);'
									: worse
										? 'color:#b23a26;'
										: 'color:var(--muted-foreground);'}>{m.label}</span
							>
						</div>
					{/each}
				</div>
			</div>

			<!-- Every budget line, biggest first; spend bars where the month's
			     transactions actually matched, hints where the rules flagged. -->
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class={cardLabel}>Budgets</span>
					<a href="/budgets" class={drill}>all budgets <ArrowRight class="size-3" /></a>
				</div>
				<div class="divide-y">
					{#each data.budgetRows as b (b.id)}
						<div class="px-5 py-2.5 transition-colors hover:bg-accent">
							<a href={`/budgets/${b.id}`} class="flex items-center gap-2">
								<StatusDot mod={budgetMod} value={b.frequency} />
								<span class="min-w-0 flex-1 truncate text-[13px] font-medium">{b.name}</span>
								{#if b.frequency}
									<span class="flex-none font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground"
										>{b.frequency}</span
									>
								{/if}
								{#if b.paid}
									<span class="flex-none font-mono text-[10px]" style="color:#2f7d5b;">paid</span>
								{:else if b.last_paid}
									<span class="flex-none font-mono text-[10px] text-muted-foreground"
										>last {shortDate(b.last_paid)}</span
									>
								{/if}
								<span class="w-16 flex-none text-right font-mono text-[11px] tabular-nums"
									>{usd(b.amount)}</span
								>
							</a>
							{#if b.spentPct != null}
								<div class="mt-1.5 h-[3px] overflow-hidden rounded-full bg-border">
									<span
										class="block h-full"
										style={`width:${Math.min(100, b.spentPct)}%;background:${
											b.spentPct >= 100 ? '#b23a26' : b.spentPct >= 85 ? '#c68a1a' : '#2f7d5b'
										};`}
									></span>
								</div>
							{/if}
							{#if b.hint}
								<a
									href="/assist"
									class="mt-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[9.5px] transition-colors hover:opacity-90"
									style="border-color:#c68a1a44;background:#c68a1a14;color:#c68a1a;"
								>
									<Zap class="size-3 flex-none" />
									<span class="min-w-0 flex-1 truncate">{b.hint}</span>
									<span class="flex-none text-signal">review →</span>
								</a>
							{/if}
						</div>
					{:else}
						<div class="px-5 py-4 text-sm text-muted-foreground">No budget lines yet.</div>
					{/each}
				</div>
			</div>

			<!-- Merch: the stock picture, alerts first. -->
			<div class="overflow-hidden rounded-[12px] border bg-card">
				<div class="flex items-center justify-between border-b px-5 py-3">
					<span class={cardLabel}>Merch</span>
					<a href="/merch" class={drill}>all merch <ArrowRight class="size-3" /></a>
				</div>
				<div class="grid grid-cols-2 divide-x border-b">
					<div class="px-5 py-3">
						<div class={cardLabel}>Items</div>
						<div class="mt-1 font-mono text-[20px] font-bold tabular-nums">{data.merch.items}</div>
					</div>
					<div class="px-5 py-3">
						<div class={cardLabel}>Stock value</div>
						<div class="mt-1 font-mono text-[20px] font-bold tabular-nums">
							{usd(data.merch.stockValue)}
						</div>
					</div>
				</div>
				<div class="divide-y">
					{#each data.merch.lowStock as m (m.id)}
						<a
							href={`/merch/${m.id}`}
							class="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-accent"
						>
							<span class="flex min-w-0 items-center gap-2">
								<TriangleAlert class="size-3.5 flex-none text-destructive" />
								<span class="min-w-0 truncate text-sm">{m.name}</span>
							</span>
							<span class="shrink-0 font-mono text-[11px] tabular-nums text-destructive">
								{m.stock} left
							</span>
						</a>
					{:else}
						<div class="px-5 py-4 text-sm text-muted-foreground">
							{data.merch.items ? 'Nothing under its stock alert.' : 'No merch tracked yet.'}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
