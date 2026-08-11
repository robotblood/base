<script lang="ts">
	// Show Details dashboard (design handoff view 1c) — read-first: run of day,
	// crew, tech notes, and the advance rail (contact, tickets, guests,
	// settlement). "Edit show" flips the values into inline ghost inputs IN
	// PLACE — the layout never changes, only whether a value is text or an
	// input. Pills cycle on click; every change persists through the PATCH
	// relay immediately.
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	import { toProjEvent } from '$lib/projects/map';
	import type { ShowDoc } from '$lib/projects/data';
	import {
		ADVANCE_STYLE,
		SHOW_STATUS,
		fmtMoney,
		hasDeal,
		merchCounted,
		merchRevenue,
		merchSold,
		settle,
		settlementTone,
		showDateLong,
		showStatus
	} from '$lib/projects/shows';
	import MarkdownDoc from '$lib/components/MarkdownDoc.svelte';
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import X from '@lucide/svelte/icons/x';

	let { data }: PageProps = $props();

	// Initial capture — the page owns all state from here; edits apply
	// optimistically and persist through the relay (same as the tracker).
	// svelte-ignore state_referenced_locally
	const ev = $state(toProjEvent(data.ev));
	// svelte-ignore state_referenced_locally
	const doc = $state<ShowDoc>(ev.show ?? {});
	const project = $derived(data.project);

	let editMode = $state(false);

	async function patch(body: Record<string, unknown>) {
		try {
			const res = await fetch(`/shows/${ev.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		} catch (e) {
			toast.error('Save failed — change is only local', { description: String(e) });
		}
	}
	const saveDoc = () => patch({ show: $state.snapshot(doc) });
	// The block editor reports every edit (the old textarea saved on blur), so
	// notes ride a debounce like the record pages do.
	let notesTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleNotesSave() {
		if (notesTimer) clearTimeout(notesTimer);
		notesTimer = setTimeout(() => {
			notesTimer = null;
			void patch({ notes: ev.notes || null });
		}, 800);
	}
	const num = (v: string): number | undefined => {
		const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
		return isNaN(n) ? undefined : n;
	};

	const contactName = $derived(
		ev.contactId ? data.directory.find((d) => d.id === ev.contactId)?.name : undefined
	);

	const todayISO = new Date().toISOString().slice(0, 10);
	const st = $derived(showStatus(ev, todayISO));
	const stStyle = $derived(SHOW_STATUS[st] ?? SHOW_STATUS.Announced);
	const advStyle = $derived(ADVANCE_STYLE[doc.advance ?? ''] ?? ADVANCE_STYLE.Pending);

	// Pills cycle in pipeline order rather than opening a dropdown, so the
	// header keeps its exact read-mode shape while editing.
	const STATUS_ORDER = ['Announced', 'Advancing', 'Confirmed', 'Completed', 'Cancelled'];
	const ADVANCE_ORDER = ['Pending', 'Confirmed', 'Advanced'];
	function cycleStatus() {
		const i = STATUS_ORDER.indexOf(ev.status || st);
		ev.status = STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
		void patch({ status: ev.status });
	}
	function cycleAdvance() {
		const i = ADVANCE_ORDER.indexOf(doc.advance ?? '');
		doc.advance = ADVANCE_ORDER[(i + 1) % ADVANCE_ORDER.length];
		void saveDoc();
	}

	// Show NN within the tour, by date.
	const showNum = $derived.by(() => {
		const list = [...data.siblings].sort((a, b) =>
			String(a.starts_at ?? '9999') < String(b.starts_at ?? '9999') ? -1 : 1
		);
		const i = list.findIndex((s) => String(s.id) === ev.id);
		return i >= 0 ? String(i + 1).padStart(2, '0') : undefined;
	});
	const backHref = $derived(project ? `/projects?open=${project.id}` : '/events');
	const rundownHref = $derived(project ? `/projects?open=${project.id}&tab=rundown` : undefined);

	const soldPct = $derived(
		doc.capacity && doc.sold != null ? Math.round((doc.sold / doc.capacity) * 100) : undefined
	);
	const tileSubs = $derived({
		capacity: soldPct === 100 ? 'sold out at 100%' : 'venue capacity',
		sold:
			soldPct != null && doc.capacity != null && doc.sold != null
				? `${soldPct}% · ${doc.capacity - doc.sold} left`
				: 'not on sale',
		gross:
			doc.gross != null && doc.sold ? `avg $${Math.round(doc.gross / doc.sold)} / tkt` : '—'
	});

	// Run-of-day dot/label states: done = green, the headline set = amber+bold,
	// everything upcoming stays quiet. In edit mode the dot cycles the state.
	const timeline = $derived(
		(doc.timeline ?? []).map((e) => ({
			...e,
			dot: e.done ? '#63c088' : e.head ? '#e6a03b' : '#3a3a40',
			ring: e.done ? 'rgba(99,192,136,0.18)' : e.head ? 'rgba(230,160,59,0.2)' : 'transparent'
		}))
	);
	function cycleDot(i: number) {
		const e = doc.timeline?.[i];
		if (!e) return;
		if (e.head) [e.head, e.done] = [false, false];
		else if (e.done) [e.done, e.head] = [false, true];
		else e.done = true;
		void saveDoc();
	}
	const initials = (name: string) =>
		name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 3)
			.toUpperCase();

	// ——— Merch count ————————————————————————————————————————————————
	// The sheet you actually fill in at the merch table: what you put out, what
	// came back, what you gave away. Sold and revenue are computed from those,
	// so the numbers always reconcile against the physical count.
	const merch = $derived(doc.merch ?? []);
	const merchTotals = $derived(
		merch.reduce(
			(acc, m) => {
				acc.in += m.in ?? 0;
				acc.sold += merchSold(m);
				acc.revenue += merchRevenue(m);
				return acc;
			},
			{ in: 0, sold: 0, revenue: 0 }
		)
	);
	const countedOut = $derived(merchCounted(doc.merch));

	function addMerchLine() {
		(doc.merch ??= []).push({ name: '', price: 0, in: 0 });
		void saveDoc();
	}
	// Typing a catalog name links the line to that record and pulls its price,
	// so counts drawn from stock find their way back to the right item.
	function nameMerchLine(i: number, value: string) {
		const name = value.trim();
		const hit = data.catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
		const line = doc.merch![i];
		line.name = name;
		line.itemId = hit?.id;
		if (hit && !line.price) line.price = hit.price;
		void saveDoc();
	}

	let applying = $state(false);
	async function applyMerch() {
		applying = true;
		try {
			const res = await fetch(`/shows/${ev.id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'apply-merch' })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.reason ?? `${res.status}`);
			doc.merchApplied = body.appliedAt;
			const bits = [
				body.drawnDown ? `${body.drawnDown} sold drawn from stock` : '',
				body.created ? `${body.created} new item${body.created === 1 ? '' : 's'} in the catalog` : ''
			].filter(Boolean);
			toast.success('Merch applied to inventory', { description: bits.join(' · ') });
			// Catalog stock and new records changed underneath us.
			void invalidateAll();
		} catch (e) {
			toast.error('Could not apply merch to inventory', { description: String(e) });
		} finally {
			applying = false;
		}
	}

	// ——— Settlement ————————————————————————————————————————————————
	const money = $derived(settle(doc));
	const dealSet = $derived(hasDeal(doc));
	// Editing any term is what converts a show from the old typed list to the
	// computed sheet; `deal` existing at all is the switch.
	function setDeal(patchDeal: Partial<NonNullable<ShowDoc['deal']>>) {
		doc.deal = { ...(doc.deal ?? {}), ...patchDeal };
		void saveDoc();
	}
	const dealRows = $derived([
		{ label: 'Box office', value: fmtMoney(money.gross) },
		...(money.expenses ? [{ label: 'Expenses', value: `−${fmtMoney(money.expenses)}` }] : []),
		{ label: 'Net', value: fmtMoney(money.net) },
		{ label: 'Guarantee', value: fmtMoney(money.guarantee) },
		...(money.splitPct
			? [{ label: `vs. ${money.splitPct}% net`, value: fmtMoney(money.splitEarn) }]
			: []),
		...(money.merchGross
			? [
					{ label: 'Merch', value: fmtMoney(money.merchGross) },
					...(money.merchToVenue
						? [{ label: `Venue merch cut`, value: `−${fmtMoney(money.merchToVenue)}` }]
						: [])
				]
			: []),
		{ label: 'Projected payout', value: fmtMoney(money.payout) }
	]);

	const railCard = 'rounded-[12px] border bg-background/60 p-4';
	const railLabel = 'font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground';
	const sectionLabel = 'font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground';
	// In edit mode the ghost border is faintly visible so editable spots read
	// at a glance; the reserved 1px means no layout shift either way.
	const ghost = $derived(
		`rounded-[5px] border bg-transparent p-0 outline-none focus:border-ring ${
			editMode ? 'border-border/60 hover:border-border' : 'border-transparent'
		}`
	);
	const ghostBtn =
		'cursor-pointer font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground/70';
	const rowX = 'hidden flex-none cursor-pointer text-muted-foreground hover:text-destructive';
</script>

<svelte:head><title>base — {ev.title}</title></svelte:head>

<div class="px-9 pb-16 pt-6">
	<div class="mx-auto max-w-[1040px]">
		<a
			href={backHref}
			class="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground/70"
		>
			<ArrowLeft class="size-3.5" /> Shows
		</a>

		<div class="rounded-[16px] border bg-card p-[26px_28px_28px]">
			<!-- Header -->
			<div class="flex flex-wrap items-start justify-between gap-5">
				<div class="min-w-0 flex-1">
					{#if project}
						<div class="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-signal">
							{project.name}{showNum ? ` · Show ${showNum}` : ''}
						</div>
					{/if}
					{#if editMode}
						<input
							value={ev.title}
							onchange={(e) => {
								ev.title = e.currentTarget.value.trim() || ev.title;
								void patch({ title: ev.title });
							}}
							aria-label="Venue"
							class="{ghost} w-full text-[36px] font-bold leading-[1.05] tracking-[-0.01em]"
						/>
						<div class="mt-1.5 flex items-center gap-1 text-[15px] text-muted-foreground">
							<input
								value={ev.location}
								placeholder="City, ST"
								onchange={(e) => {
									ev.location = e.currentTarget.value.trim();
									void patch({ location: ev.location || null });
								}}
								aria-label="City"
								class="{ghost} w-[120px]"
							/>
							<span>·</span>
							<input
								type="datetime-local"
								value={ev.when.slice(0, 16)}
								onchange={(e) => {
									ev.when = e.currentTarget.value;
									void patch({ starts_at: ev.when || null });
								}}
								aria-label="Show date"
								class="{ghost} text-[14px]"
							/>
						</div>
					{:else}
						<h1 class="text-[36px] font-bold leading-[1.05] tracking-[-0.01em]">{ev.title}</h1>
						<div class="mt-1.5 text-[15px] text-muted-foreground">
							{ev.location ? `${ev.location} · ` : ''}{showDateLong(ev.when)}
						</div>
					{/if}
				</div>
				<div class="flex flex-col items-end gap-3">
					<div class="flex items-center gap-2">
						{#if editMode}
							<button
								onclick={cycleStatus}
								title="Click to change status"
								class="inline-flex cursor-pointer items-center gap-[7px] rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"
								style="color:{stStyle[0]};background:{stStyle[1]};"
							>
								<span class="size-[7px] rounded-full" style="background:{stStyle[0]};"></span>{st}
							</button>
							<button
								onclick={cycleAdvance}
								title="Click to change advance state"
								class="cursor-pointer rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"
								style="color:{advStyle[0]};background:{advStyle[1]};"
								>Advance · {doc.advance ?? '—'}</button
							>
						{:else}
							<span
								class="inline-flex items-center gap-[7px] rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"
								style="color:{stStyle[0]};background:{stStyle[1]};"
							>
								<span class="size-[7px] rounded-full" style="background:{stStyle[0]};"></span>{st}
							</span>
							{#if doc.advance}
								<span
									class="rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"
									style="color:{advStyle[0]};background:{advStyle[1]};"
									>Advance · {doc.advance}</span
								>
							{/if}
						{/if}
					</div>
					<div class="flex gap-2">
						{#if rundownHref}
							<a
								href={rundownHref}
								class="rounded-[8px] border border-foreground/15 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-foreground/80 hover:border-ring/40"
								>Rundown</a
							>
						{/if}
						<button
							onclick={() => (editMode = !editMode)}
							class="cursor-pointer rounded-[8px] bg-signal px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-signal-foreground hover:opacity-90"
							>{editMode ? 'Done' : 'Edit show'}</button
						>
					</div>
				</div>
			</div>

			<!-- Stat tiles — values edit in place -->
			<div
				class="mb-1 mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border bg-border sm:grid-cols-4"
			>
				<div class="flex flex-col gap-1.5 bg-muted p-[16px_18px]">
					<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70"
						>Capacity</span
					>
					{#if editMode}
						<input
							value={doc.capacity ?? ''}
							onchange={(e) => {
								doc.capacity = num(e.currentTarget.value);
								void saveDoc();
							}}
							aria-label="Capacity"
							class="{ghost} w-full text-[24px] font-semibold leading-none"
						/>
					{:else}
						<span class="text-[24px] font-semibold leading-none"
							>{doc.capacity != null ? doc.capacity : '—'}</span
						>
					{/if}
					<span class="font-mono text-[10.5px] text-muted-foreground">{tileSubs.capacity}</span>
				</div>
				<div class="flex flex-col gap-1.5 bg-muted p-[16px_18px]">
					<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70"
						>Tickets Sold</span
					>
					{#if editMode}
						<input
							value={doc.sold ?? ''}
							onchange={(e) => {
								doc.sold = num(e.currentTarget.value);
								void saveDoc();
							}}
							aria-label="Tickets sold"
							class="{ghost} w-full text-[24px] font-semibold leading-none"
						/>
					{:else}
						<span class="text-[24px] font-semibold leading-none"
							>{doc.sold != null ? doc.sold : '—'}</span
						>
					{/if}
					<span class="font-mono text-[10.5px] text-muted-foreground">{tileSubs.sold}</span>
				</div>
				<div class="flex flex-col gap-1.5 bg-muted p-[16px_18px]">
					<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70"
						>Gross</span
					>
					{#if editMode}
						<input
							value={fmtMoney(doc.gross)}
							onchange={(e) => {
								doc.gross = num(e.currentTarget.value);
								void saveDoc();
							}}
							aria-label="Gross"
							class="{ghost} w-full text-[24px] font-semibold leading-none"
						/>
					{:else}
						<span class="text-[24px] font-semibold leading-none">{fmtMoney(doc.gross)}</span>
					{/if}
					<span class="font-mono text-[10.5px] text-muted-foreground">{tileSubs.gross}</span>
				</div>
				<div class="flex flex-col gap-1.5 bg-muted p-[16px_18px]">
					<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70"
						>Doors</span
					>
					{#if editMode}
						<input
							value={doc.doors ?? ''}
							placeholder="18:00"
							onchange={(e) => {
								doc.doors = e.currentTarget.value.trim() || undefined;
								void saveDoc();
							}}
							aria-label="Doors"
							class="{ghost} w-full text-[24px] font-semibold leading-none"
						/>
						<span class="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
							set <input
								value={doc.set ?? ''}
								placeholder="21:00"
								onchange={(e) => {
									doc.set = e.currentTarget.value.trim() || undefined;
									void saveDoc();
								}}
								aria-label="Set time"
								class="{ghost} w-[52px] font-mono text-[10.5px]"
							/>
						</span>
					{:else}
						<span class="text-[24px] font-semibold leading-none">{doc.doors || '—'}</span>
						<span class="font-mono text-[10.5px] text-muted-foreground"
							>{doc.set ? `set ${doc.set}` : '—'}</span
						>
					{/if}
				</div>
			</div>

			<!-- Body: main + rail -->
			<div class="mt-6 grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[1fr_340px]">
				<div class="flex min-w-0 flex-col gap-[22px]">
					<div>
						<div class="{sectionLabel} mb-3.5 flex items-center justify-between">
							<span>Run of Day</span>
							<span class="flex items-center gap-3 font-mono text-[10px] tracking-normal">
								{#if editMode}
									<span class="flex items-center gap-1 text-muted-foreground/70">
										LOAD-IN <input
											value={doc.loadIn ?? ''}
											placeholder="12:00"
											onchange={(e) => {
												doc.loadIn = e.currentTarget.value.trim() || undefined;
												void saveDoc();
											}}
											aria-label="Load-in"
											class="{ghost} w-[48px] text-[10px]"
										/>
										· LOAD-OUT <input
											value={doc.loadOut ?? ''}
											placeholder="23:30"
											onchange={(e) => {
												doc.loadOut = e.currentTarget.value.trim() || undefined;
												void saveDoc();
											}}
											aria-label="Load-out"
											class="{ghost} w-[48px] text-[10px]"
										/>
									</span>
									<button
										onclick={() => {
											(doc.timeline ??= []).push({ t: '', l: 'New entry' });
											void saveDoc();
										}}
										class={ghostBtn}>+ Add</button
									>
								{:else if doc.loadIn || doc.loadOut}
									<span class="text-muted-foreground/70"
										>LOAD-IN {doc.loadIn ?? '—'} · LOAD-OUT {doc.loadOut ?? '—'}</span
									>
								{/if}
							</span>
						</div>
						{#each timeline as e, i (i)}
							<div class="group/tl grid grid-cols-[58px_18px_1fr] items-center gap-3 py-[9px]">
								{#if editMode}
									<input
										value={e.t}
										placeholder="00:00"
										onchange={(ee) => {
											doc.timeline![i].t = ee.currentTarget.value.trim();
											void saveDoc();
										}}
										aria-label="Time"
										class="{ghost} w-full font-mono text-[13px] text-foreground/80"
									/>
									<button
										onclick={() => cycleDot(i)}
										title="Cycle: upcoming → done → headline"
										class="flex cursor-pointer justify-center"
									>
										<span
											class="size-[9px] rounded-full"
											style="background:{e.dot};box-shadow:0 0 0 3px {e.ring};"
										></span>
									</button>
									<span class="flex min-w-0 items-center gap-2">
										<input
											value={e.l}
											onchange={(ee) => {
												doc.timeline![i].l = ee.currentTarget.value.trim();
												void saveDoc();
											}}
											aria-label="Entry"
											class="{ghost} min-w-0 flex-1 text-[14.5px] {e.head
												? 'font-bold'
												: 'text-foreground/80'}"
										/>
										<button
											onclick={() => {
												doc.timeline!.splice(i, 1);
												void saveDoc();
											}}
											title="Remove entry"
											class="{rowX} group-hover/tl:block"><X class="size-3.5" /></button
										>
									</span>
								{:else}
									<span class="font-mono text-[13px] text-foreground/80">{e.t}</span>
									<span class="flex justify-center">
										<span
											class="size-[9px] rounded-full"
											style="background:{e.dot};box-shadow:0 0 0 3px {e.ring};"
										></span>
									</span>
									<span
										class="text-[14.5px] {e.head
											? 'font-bold'
											: e.done
												? 'text-muted-foreground'
												: 'text-foreground/80'}">{e.l}</span
									>
								{/if}
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">
								No run of day yet — times land here as the advance firms up.
							</div>
						{/each}
					</div>

					<div>
						<div class="{sectionLabel} mb-3 flex items-center justify-between">
							<span>Crew &amp; Roles</span>
							{#if editMode}
								<button
									onclick={() => {
										(doc.crew ??= []).push({ name: 'New crew', role: 'role' });
										void saveDoc();
									}}
									class={ghostBtn}>+ Add</button
								>
							{/if}
						</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each doc.crew ?? [] as c, i (i)}
								<div
									class="group/cr flex items-center gap-2.5 rounded-[10px] border bg-background/60 px-3 py-[9px]"
								>
									<span
										class="grid size-[26px] flex-none place-items-center rounded-full bg-secondary font-mono text-[10px] text-foreground/70"
										>{initials(c.name)}</span
									>
									{#if editMode}
										<span class="min-w-0 flex-1 leading-[1.25]">
											<input
												value={c.name}
												onchange={(e) => {
													doc.crew![i].name = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Crew name"
												class="{ghost} w-full text-[13.5px]"
											/>
											<input
												value={c.role}
												onchange={(e) => {
													doc.crew![i].role = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Crew role"
												class="{ghost} w-full font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70"
											/>
										</span>
										<button
											onclick={() => {
												doc.crew!.splice(i, 1);
												void saveDoc();
											}}
											title="Remove crew member"
											class="{rowX} group-hover/cr:block"><X class="size-3.5" /></button
										>
									{:else}
										<span class="min-w-0 leading-[1.25]">
											<span class="block truncate text-[13.5px]">{c.name}</span>
											<span
												class="block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70"
												>{c.role}</span
											>
										</span>
									{/if}
								</div>
							{:else}
								<div class="text-[13px] text-muted-foreground">No crew assigned yet.</div>
							{/each}
						</div>
					</div>

					<div>
						<div class="{sectionLabel} mb-2.5">Tech &amp; Stage Notes</div>
						{#if editMode}
							<MarkdownField
								bind:value={ev.notes}
								placeholder="Power, backline, curfew…"
								compact
								onchange={() => scheduleNotesSave()}
							/>
						{:else if ev.notes}
							<div
								class="rounded-[10px] border bg-background/60 p-[14px_16px] text-[14px] leading-[1.6] text-foreground/75"
							>
								<MarkdownDoc source={ev.notes} />
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">
								Nothing yet — power, backline, curfew notes live here.
							</div>
						{/if}
						{#if editMode || (doc.setlist && rundownHref)}
							<div
								class="mt-2.5 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]"
							>
								{#if editMode}
									<span class="text-signal">Set list ·</span>
									<input
										value={doc.setlist ?? ''}
										placeholder="Fall Tour v3"
										onchange={(e) => {
											doc.setlist = e.currentTarget.value.trim() || undefined;
											void saveDoc();
										}}
										aria-label="Set list label"
										class="{ghost} w-[140px] font-mono text-[11px] uppercase text-signal"
									/>
								{:else}
									<a href={rundownHref} class="text-signal hover:opacity-80"
										>Set list · {doc.setlist} →</a
									>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Merch count sheet. Always editable (you fill it in at the table
					     mid-show, not in "edit show" mode). IN/OUT/COMP are typed;
					     SOLD and revenue are derived so the sheet reconciles. -->
					<div>
						<div class="{sectionLabel} mb-3 flex items-center justify-between">
							<span>Merch Count</span>
							<span class="flex items-center gap-3">
								{#if merchTotals.sold}
									<span class="font-mono text-[11px] normal-case tracking-normal text-foreground/70">
										{merchTotals.sold} sold · {fmtMoney(merchTotals.revenue)}
									</span>
								{/if}
								<button onclick={addMerchLine} class={ghostBtn}>+ Add</button>
							</span>
						</div>

						{#if merch.length}
							<div class="overflow-hidden rounded-[10px] border bg-background/60">
								<div
									class="grid grid-cols-[1fr_58px_46px_46px_46px_74px_20px] items-center gap-2 border-b px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
								>
									<span>Item</span>
									<span class="text-right">Price</span>
									<span class="text-right">In</span>
									<span class="text-right">Out</span>
									<span class="text-right">Comp</span>
									<span class="text-right">Sold</span>
									<span></span>
								</div>
								{#each merch as m, i (i)}
									<div
										class="group/mc grid grid-cols-[1fr_58px_46px_46px_46px_74px_20px] items-center gap-2 border-b px-3 py-[7px] text-[13px] last:border-b-0"
									>
										<input
											value={m.name}
											placeholder="Item name…"
											list="merch-catalog"
											onchange={(e) => nameMerchLine(i, e.currentTarget.value)}
											aria-label="Merch item"
											class="{ghost} min-w-0"
										/>
										<input
											value={m.price || ''}
											inputmode="decimal"
											placeholder="0"
											onchange={(e) => {
												doc.merch![i].price = Number(e.currentTarget.value.replace(/[^0-9.]/g, '')) || 0;
												void saveDoc();
											}}
											aria-label="Price"
											class="{ghost} min-w-0 text-right font-mono text-[12px]"
										/>
										<input
											value={m.in || ''}
											inputmode="numeric"
											placeholder="0"
											onchange={(e) => {
												doc.merch![i].in = num(e.currentTarget.value) ?? 0;
												void saveDoc();
											}}
											aria-label="Count in"
											class="{ghost} min-w-0 text-right font-mono text-[12px]"
										/>
										<input
											value={m.out ?? ''}
											inputmode="numeric"
											placeholder="—"
											onchange={(e) => {
												const v = e.currentTarget.value.trim();
												doc.merch![i].out = v === '' ? undefined : (num(v) ?? 0);
												void saveDoc();
											}}
											aria-label="Count out"
											class="{ghost} min-w-0 text-right font-mono text-[12px]"
										/>
										<input
											value={m.comp ?? ''}
											inputmode="numeric"
											placeholder="—"
											onchange={(e) => {
												const v = e.currentTarget.value.trim();
												doc.merch![i].comp = v === '' ? undefined : (num(v) ?? 0);
												void saveDoc();
											}}
											aria-label="Comped"
											class="{ghost} min-w-0 text-right font-mono text-[12px]"
										/>
										<span class="text-right font-mono text-[12px]">
											{#if m.out == null}
												<span class="text-muted-foreground/60">uncounted</span>
											{:else}
												<span class="text-foreground/80">{merchSold(m)}</span>
												<span class="ml-1 text-muted-foreground/70">{fmtMoney(merchRevenue(m))}</span>
											{/if}
										</span>
										<button
											onclick={() => {
												doc.merch!.splice(i, 1);
												void saveDoc();
											}}
											title="Remove line"
											class="{rowX} group-hover/mc:block"><X class="size-3.5" /></button
										>
									</div>
								{/each}
							</div>
							<datalist id="merch-catalog">
								{#each data.catalog as c (c.id)}<option value={c.name}></option>{/each}
							</datalist>

							<div class="mt-2.5 flex items-center gap-2 font-mono text-[11px]">
								{#if doc.merchApplied}
									<span class="text-muted-foreground">
										Applied to inventory {doc.merchApplied.slice(0, 10)}
									</span>
								{:else if countedOut}
									<button
										onclick={applyMerch}
										disabled={applying}
										class="rounded-[6px] border px-2.5 py-1 uppercase tracking-[0.06em] text-signal hover:bg-accent disabled:opacity-50"
									>
										{applying ? 'Applying…' : 'Apply to inventory'}
									</button>
									<span class="text-muted-foreground">
										draws {merchTotals.sold} from stock; unlisted items join the catalog
									</span>
								{:else}
									<span class="text-muted-foreground">
										Fill in OUT for every line to settle the count.
									</span>
								{/if}
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">
								No merch counted — add what goes out to the table and count it back in at the end
								of the night.
							</div>
						{/if}
					</div>
				</div>

				<!-- Right rail -->
				<div class="flex min-w-0 flex-col gap-4">
					<div class={railCard}>
						<div class="{railLabel} mb-3">Venue Contact</div>
						{#if editMode}
							<select
								value={ev.contactId ?? ''}
								onchange={(e) => {
									ev.contactId = e.currentTarget.value || undefined;
									void patch({ contact_id: ev.contactId ? Number(ev.contactId) : null });
								}}
								aria-label="Contact person"
								class="{ghost} block w-full cursor-pointer text-[15px] font-semibold"
							>
								<option value="">— no contact —</option>
								{#each data.directory as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
							</select>
							<input
								value={doc.contactRole ?? ''}
								placeholder="ROLE"
								onchange={(e) => {
									doc.contactRole = e.currentTarget.value.trim() || undefined;
									void saveDoc();
								}}
								aria-label="Contact role"
								class="{ghost} mb-3 mt-0.5 w-full font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70"
							/>
							<div class="flex flex-col gap-1.5 text-[13px]">
								<input
									value={ev.phone}
									placeholder="phone"
									onchange={(e) => {
										ev.phone = e.currentTarget.value.trim();
										void patch({ phone: ev.phone || null });
									}}
									aria-label="Phone"
									class="{ghost} w-full text-foreground/75"
								/>
								<input
									value={ev.email}
									placeholder="email"
									onchange={(e) => {
										ev.email = e.currentTarget.value.trim();
										void patch({ email: ev.email || null });
									}}
									aria-label="Email"
									class="{ghost} w-full text-signal"
								/>
							</div>
						{:else if contactName || ev.phone || ev.email}
							{#if contactName}
								<a
									href="/people/{ev.contactId}"
									class="text-[15px] font-semibold hover:underline">{contactName}</a
								>
								<div
									class="mb-3 mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70"
								>
									{doc.contactRole || 'venue contact'}
								</div>
							{/if}
							<div class="flex flex-col gap-1.5 text-[13px] text-foreground/75">
								{#if ev.phone}<div>{ev.phone}</div>{/if}
								{#if ev.email}<a href="mailto:{ev.email}" class="text-signal hover:opacity-80"
										>{ev.email}</a
									>{/if}
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">No contact linked yet.</div>
						{/if}
						{#if ev.address || editMode}
							<!-- Map placeholder per handoff — swap for a real map provider later.
							     The address chip itself is the editable field. -->
							<div
								class="relative mt-3.5 h-[118px] overflow-hidden rounded-[10px] border"
								style="background-color:oklch(0.2 0.01 240);background-image:linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px);background-size:22px 22px;"
							>
								<span
									class="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-signal"
									style="border-radius:50% 50% 50% 0;box-shadow:0 0 0 4px rgba(230,160,59,0.22);"
								></span>
								{#if editMode}
									<input
										value={ev.address}
										placeholder="street address…"
										onchange={(e) => {
											ev.address = e.currentTarget.value.trim();
											void patch({ address: ev.address || null });
										}}
										aria-label="Address"
										class="absolute bottom-2 left-2.5 w-[90%] rounded-[5px] border border-transparent bg-black/70 px-1.5 py-[3px] font-mono text-[10px] text-white/85 outline-none focus:border-ring"
									/>
								{:else}
									<span
										class="absolute bottom-2 left-2.5 max-w-[90%] truncate rounded-[5px] bg-black/70 px-1.5 py-[3px] font-mono text-[10px] text-white/85"
										>{ev.address}</span
									>
								{/if}
							</div>
						{/if}
					</div>

					{#if doc.tickets?.length || editMode}
						<div class={railCard}>
							<div class="mb-3 flex items-center justify-between">
								<span class={railLabel}>Tickets</span>
								{#if editMode}
									<button
										onclick={() => {
											(doc.tickets ??= []).push({ tier: 'GA', price: '$', sold: '0' });
											void saveDoc();
										}}
										class={ghostBtn}>+ Add</button
									>
								{/if}
							</div>
							{#each doc.tickets ?? [] as tk, i (i)}
								<div
									class="group/tk flex items-center justify-between gap-2 border-b border-border/60 py-[7px] last:border-b-0"
								>
									{#if editMode}
										<span class="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
											<input
												value={tk.tier}
												onchange={(e) => {
													doc.tickets![i].tier = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Tier"
												class="{ghost} w-[64px]"
											/>
											<input
												value={tk.price}
												onchange={(e) => {
													doc.tickets![i].price = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Price"
												class="{ghost} w-[48px] text-muted-foreground/70"
											/>
										</span>
										<span class="flex items-center gap-1.5">
											<input
												value={tk.sold}
												onchange={(e) => {
													doc.tickets![i].sold = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Sold"
												class="{ghost} w-[76px] text-right font-mono text-[12.5px] text-foreground/80"
											/>
											<button
												onclick={() => {
													doc.tickets!.splice(i, 1);
													void saveDoc();
												}}
												title="Remove tier"
												class="{rowX} group-hover/tk:block"><X class="size-3.5" /></button
											>
										</span>
									{:else}
										<span class="text-[13.5px]"
											>{tk.tier}
											<span class="text-muted-foreground/70">{tk.price}</span></span
										>
										<span class="font-mono text-[12.5px] text-foreground/80">{tk.sold}</span>
									{/if}
								</div>
							{:else}
								<div class="text-[13px] text-muted-foreground">No tiers yet.</div>
							{/each}
						</div>
					{/if}

					{#if doc.guests?.length || editMode}
						<div class={railCard}>
							<div class="mb-3 flex items-center justify-between">
								<span class={railLabel}>Guest List</span>
								<span class="flex items-center gap-2">
									{#if editMode}
										<input
											value={doc.guestCount ?? ''}
											placeholder="0 / 25"
											onchange={(e) => {
												doc.guestCount = e.currentTarget.value.trim() || undefined;
												void saveDoc();
											}}
											aria-label="Guest count"
											class="{ghost} w-[56px] text-right font-mono text-[10.5px] text-muted-foreground/70"
										/>
										<button
											onclick={() => {
												(doc.guests ??= []).push({ name: 'New guest', type: 'Guest' });
												void saveDoc();
											}}
											class={ghostBtn}>+ Add</button
										>
									{:else if doc.guestCount}
										<span class="font-mono text-[10.5px] text-muted-foreground/70"
											>{doc.guestCount}</span
										>
									{/if}
								</span>
							</div>
							{#each doc.guests ?? [] as g, i (i)}
								<div class="group/gs flex items-center justify-between gap-2 py-1.5">
									{#if editMode}
										<input
											value={g.name}
											onchange={(e) => {
												doc.guests![i].name = e.currentTarget.value.trim();
												void saveDoc();
											}}
											aria-label="Guest name"
											class="{ghost} min-w-0 flex-1 text-[13.5px] text-foreground/80"
										/>
										<span class="flex items-center gap-1.5">
											<input
												value={g.type}
												onchange={(e) => {
													doc.guests![i].type = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Guest type"
												class="{ghost} w-[70px] text-right font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground"
											/>
											<button
												onclick={() => {
													doc.guests!.splice(i, 1);
													void saveDoc();
												}}
												title="Remove guest"
												class="{rowX} group-hover/gs:block"><X class="size-3.5" /></button
											>
										</span>
									{:else}
										<span class="text-[13.5px] text-foreground/80">{g.name}</span>
										<span
											class="rounded-[5px] border border-foreground/15 px-[7px] py-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground"
											>{g.type}</span
										>
									{/if}
								</div>
							{:else}
								<div class="text-[13px] text-muted-foreground">No guests yet.</div>
							{/each}
						</div>
					{/if}

					<!-- Settlement. Once deal terms exist the sheet is computed from them
					     (box office → expenses → net → the better of guarantee/split,
					     plus merch); until then it renders whatever was typed into the
					     older free-form list, so nothing already entered is lost. -->
					{#if dealSet}
						<div class={railCard}>
							<div class="mb-3 flex items-center justify-between">
								<span class={railLabel}>Settlement</span>
								{#if money.overage}
									<span class="font-mono text-[10px] uppercase tracking-[0.06em] text-[#63c088]">
										+{fmtMoney(money.overage)} over
									</span>
								{/if}
							</div>

							{#if editMode}
								<div class="mb-3 flex flex-col gap-2 border-b pb-3">
									{#snippet term(label: string, value: number | undefined, suffix: string, set: (n: number | undefined) => void)}
										<div class="flex items-center justify-between gap-2">
											<span class="text-[13px] text-muted-foreground">{label}</span>
											<span class="flex items-center gap-1 font-mono text-[13px]">
												<input
													value={value ?? ''}
													inputmode="decimal"
													placeholder="0"
													onchange={(e) => set(num(e.currentTarget.value))}
													aria-label={label}
													class="{ghost} w-[62px] text-right"
												/>
												<span class="text-muted-foreground/70">{suffix}</span>
											</span>
										</div>
									{/snippet}
									{@render term('Guarantee', doc.deal?.guarantee, '$', (n) =>
										setDeal({ guarantee: n })
									)}
									{@render term('Split of net', doc.deal?.split, '%', (n) => setDeal({ split: n }))}
									{@render term('Venue merch cut', doc.deal?.merchRate, '%', (n) =>
										setDeal({ merchRate: n })
									)}

									<div class="mt-1 flex items-center justify-between">
										<span class={railLabel}>Expenses</span>
										<button
											onclick={() => {
												const deal = (doc.deal ??= {});
												(deal.expenses ??= []).push({ label: 'Expense', amount: 0 });
												void saveDoc();
											}}
											class={ghostBtn}>+ Add</button
										>
									</div>
									{#each doc.deal?.expenses ?? [] as x, i (i)}
										<div class="group/ex flex items-center justify-between gap-2">
											<input
												value={x.label}
												onchange={(e) => {
													doc.deal!.expenses![i].label = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Expense name"
												class="{ghost} min-w-0 flex-1 text-[13px] text-muted-foreground"
											/>
											<span class="flex items-center gap-1.5">
												<input
													value={x.amount || ''}
													inputmode="decimal"
													placeholder="0"
													onchange={(e) => {
														doc.deal!.expenses![i].amount = num(e.currentTarget.value) ?? 0;
														void saveDoc();
													}}
													aria-label="Expense amount"
													class="{ghost} w-[70px] text-right font-mono text-[13px]"
												/>
												<button
													onclick={() => {
														doc.deal!.expenses!.splice(i, 1);
														void saveDoc();
													}}
													title="Remove expense"
													class="{rowX} group-hover/ex:block"><X class="size-3.5" /></button
												>
											</span>
										</div>
									{/each}
								</div>
							{/if}

							{#each dealRows as r (r.label)}
								{@const tone = settlementTone(r.label)}
								<div
									class="flex items-center justify-between gap-2 py-1.5 {r.label === 'Projected payout'
										? 'mt-1 border-t pt-2.5'
										: ''}"
								>
									<span class="text-[13px] text-muted-foreground">{r.label}</span>
									<span
										class="font-mono text-[13px] {tone === 'good'
											? 'text-[#63c088]'
											: tone === 'accent'
												? 'text-signal'
												: ''}">{r.value}</span
									>
								</div>
							{/each}
						</div>
					{:else if doc.settlement?.length || editMode}
						<div class={railCard}>
							<div class="mb-3 flex items-center justify-between">
								<span class={railLabel}>Settlement</span>
								{#if editMode}
									<button
										onclick={() => {
											(doc.settlement ??= []).push({ label: 'New line', value: '$' });
											void saveDoc();
										}}
										class={ghostBtn}>+ Add</button
									>
								{/if}
							</div>
							{#if editMode}
								<button
									onclick={() => setDeal({ guarantee: 0 })}
									class="mb-2 w-full rounded-[6px] border py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-signal hover:bg-accent"
									>Set up deal terms</button
								>
							{/if}
							{#each doc.settlement ?? [] as r, i (i)}
								{@const tone = settlementTone(r.label)}
								<div class="group/st flex items-center justify-between gap-2 py-1.5">
									{#if editMode}
										<input
											value={r.label}
											onchange={(e) => {
												doc.settlement![i].label = e.currentTarget.value.trim();
												void saveDoc();
											}}
											aria-label="Settlement label"
											class="{ghost} min-w-0 flex-1 text-[13px] text-muted-foreground"
										/>
										<span class="flex items-center gap-1.5">
											<input
												value={r.value}
												onchange={(e) => {
													doc.settlement![i].value = e.currentTarget.value.trim();
													void saveDoc();
												}}
												aria-label="Settlement value"
												class="{ghost} w-[80px] text-right font-mono text-[13px] {tone === 'good'
													? 'text-[#63c088]'
													: tone === 'accent'
														? 'text-signal'
														: ''}"
											/>
											<button
												onclick={() => {
													doc.settlement!.splice(i, 1);
													void saveDoc();
												}}
												title="Remove line"
												class="{rowX} group-hover/st:block"><X class="size-3.5" /></button
											>
										</span>
									{:else}
										<span class="text-[13px] text-muted-foreground">{r.label}</span>
										<span
											class="font-mono text-[13px] {tone === 'good'
												? 'text-[#63c088]'
												: tone === 'accent'
													? 'text-signal'
													: ''}">{r.value}</span
										>
									{/if}
								</div>
							{:else}
								<div class="text-[13px] text-muted-foreground">No settlement terms yet.</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
