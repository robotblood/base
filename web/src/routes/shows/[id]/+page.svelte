<script lang="ts">
	// Show Details dashboard (design handoff view 1c) — read-first: run of day,
	// crew, tech notes, and the advance rail (contact, tickets, guests,
	// settlement). Editing routes through the event form (Edit show).
	import type { PageProps } from './$types';
	import { toProjEvent } from '$lib/projects/map';
	import type { ShowDoc } from '$lib/projects/data';
	import {
		ADVANCE_STYLE,
		SHOW_STATUS,
		fmtMoney,
		settlementTone,
		showDateLong,
		showStatus
	} from '$lib/projects/shows';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data }: PageProps = $props();

	const ev = $derived(toProjEvent(data.ev));
	const doc = $derived<ShowDoc>(ev.show ?? {});
	const project = $derived(data.project);
	const contactName = $derived(
		data.contact ? String(data.contact.name ?? '') : undefined
	);

	const todayISO = new Date().toISOString().slice(0, 10);
	const st = $derived(showStatus(ev, todayISO));
	const stStyle = $derived(SHOW_STATUS[st] ?? SHOW_STATUS.Announced);
	const advStyle = $derived(ADVANCE_STYLE[doc.advance ?? ''] ?? ADVANCE_STYLE.Pending);

	// Show NN within the tour, by date.
	const num = $derived.by(() => {
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
	const stats = $derived([
		{
			k: 'Capacity',
			v: doc.capacity != null ? String(doc.capacity) : '—',
			sub: soldPct === 100 ? 'sold out at 100%' : 'venue capacity'
		},
		{
			k: 'Tickets Sold',
			v: doc.sold != null ? String(doc.sold) : '—',
			sub:
				soldPct != null && doc.capacity != null && doc.sold != null
					? `${soldPct}% · ${doc.capacity - doc.sold} left`
					: 'not on sale'
		},
		{
			k: 'Gross',
			v: fmtMoney(doc.gross),
			sub:
				doc.gross != null && doc.sold
					? `avg $${Math.round(doc.gross / doc.sold)} / tkt`
					: '—'
		},
		{ k: 'Doors', v: doc.doors || '—', sub: doc.set ? `set ${doc.set}` : '—' }
	]);

	// Run-of-day dot/label states: done = green, the headline set = amber+bold,
	// everything upcoming stays quiet.
	const timeline = $derived(
		(doc.timeline ?? []).map((e) => ({
			...e,
			dot: e.done ? '#63c088' : e.head ? '#e6a03b' : '#3a3a40',
			ring: e.done ? 'rgba(99,192,136,0.18)' : e.head ? 'rgba(230,160,59,0.2)' : 'transparent'
		}))
	);
	const initials = (name: string) =>
		name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 3)
			.toUpperCase();

	const railCard = 'rounded-[12px] border bg-background/60 p-4';
	const railLabel = 'font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground';
	const sectionLabel = 'font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground';
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
				<div class="min-w-0">
					{#if project}
						<div class="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-signal">
							{project.name}{num ? ` · Show ${num}` : ''}
						</div>
					{/if}
					<h1 class="text-[36px] font-bold leading-[1.05] tracking-[-0.01em]">{ev.title}</h1>
					<div class="mt-1.5 text-[15px] text-muted-foreground">
						{ev.location ? `${ev.location} · ` : ''}{showDateLong(ev.when)}
					</div>
				</div>
				<div class="flex flex-col items-end gap-3">
					<div class="flex gap-2">
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
					</div>
					<div class="flex gap-2">
						{#if rundownHref}
							<a
								href={rundownHref}
								class="rounded-[8px] border border-foreground/15 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-foreground/80 hover:border-ring/40"
								>Rundown</a
							>
						{/if}
						<a
							href="/events/{ev.id}"
							class="rounded-[8px] bg-signal px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-signal-foreground hover:opacity-90"
							>Edit show</a
						>
					</div>
				</div>
			</div>

			<!-- Stat tiles -->
			<div
				class="mb-1 mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border bg-border sm:grid-cols-4"
			>
				{#each stats as s (s.k)}
					<div class="flex flex-col gap-1.5 bg-muted p-[16px_18px]">
						<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70"
							>{s.k}</span
						>
						<span class="text-[24px] font-semibold leading-none">{s.v}</span>
						<span class="font-mono text-[10.5px] text-muted-foreground">{s.sub}</span>
					</div>
				{/each}
			</div>

			<!-- Body: main + rail -->
			<div class="mt-6 grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[1fr_340px]">
				<div class="flex min-w-0 flex-col gap-[22px]">
					<div>
						<div class="{sectionLabel} mb-3.5">Run of Day</div>
						{#each timeline as e, i (i)}
							<div class="grid grid-cols-[58px_18px_1fr] items-center gap-3 py-[9px]">
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
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">
								No run of day yet — times land here as the advance firms up.
							</div>
						{/each}
					</div>

					<div>
						<div class="{sectionLabel} mb-3">Crew &amp; Roles</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each doc.crew ?? [] as c, i (i)}
								<div
									class="flex items-center gap-2.5 rounded-[10px] border bg-background/60 px-3 py-[9px]"
								>
									<span
										class="grid size-[26px] flex-none place-items-center rounded-full bg-secondary font-mono text-[10px] text-foreground/70"
										>{initials(c.name)}</span
									>
									<span class="min-w-0 leading-[1.25]">
										<span class="block truncate text-[13.5px]">{c.name}</span>
										<span
											class="block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70"
											>{c.role}</span
										>
									</span>
								</div>
							{:else}
								<div class="text-[13px] text-muted-foreground">No crew assigned yet.</div>
							{/each}
						</div>
					</div>

					<div>
						<div class="{sectionLabel} mb-2.5">Tech &amp; Stage Notes</div>
						{#if ev.notes}
							<div
								class="rounded-[10px] border bg-background/60 p-[14px_16px] text-[14px] leading-[1.6] text-foreground/75"
							>
								{ev.notes}
							</div>
						{:else}
							<div class="text-[13px] text-muted-foreground">
								Nothing yet — power, backline, curfew notes live here.
							</div>
						{/if}
						{#if doc.setlist && rundownHref}
							<div class="mt-2.5">
								<a
									href={rundownHref}
									class="font-mono text-[11px] uppercase tracking-[0.08em] text-signal hover:opacity-80"
									>Set list · {doc.setlist} →</a
								>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right rail -->
				<div class="flex min-w-0 flex-col gap-4">
					<div class={railCard}>
						<div class="{railLabel} mb-3">Venue Contact</div>
						{#if contactName || ev.phone || ev.email}
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
						{#if ev.address}
							<!-- Map placeholder per handoff — swap for a real map provider later. -->
							<div
								class="relative mt-3.5 h-[118px] overflow-hidden rounded-[10px] border"
								style="background-color:oklch(0.2 0.01 240);background-image:linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px);background-size:22px 22px;"
							>
								<span
									class="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-signal"
									style="border-radius:50% 50% 50% 0;box-shadow:0 0 0 4px rgba(230,160,59,0.22);"
								></span>
								<span
									class="absolute bottom-2 left-2.5 max-w-[90%] truncate rounded-[5px] bg-black/70 px-1.5 py-[3px] font-mono text-[10px] text-white/85"
									>{ev.address}</span
								>
							</div>
						{/if}
					</div>

					{#if doc.tickets?.length}
						<div class={railCard}>
							<div class="{railLabel} mb-3">Tickets</div>
							{#each doc.tickets as tk, i (i)}
								<div
									class="flex items-center justify-between border-b border-border/60 py-[7px] last:border-b-0"
								>
									<span class="text-[13.5px]"
										>{tk.tier}
										<span class="text-muted-foreground/70">{tk.price}</span></span
									>
									<span class="font-mono text-[12.5px] text-foreground/80">{tk.sold}</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if doc.guests?.length}
						<div class={railCard}>
							<div class="mb-3 flex items-center justify-between">
								<span class={railLabel}>Guest List</span>
								{#if doc.guestCount}
									<span class="font-mono text-[10.5px] text-muted-foreground/70"
										>{doc.guestCount}</span
									>
								{/if}
							</div>
							{#each doc.guests as g, i (i)}
								<div class="flex items-center justify-between py-1.5">
									<span class="text-[13.5px] text-foreground/80">{g.name}</span>
									<span
										class="rounded-[5px] border border-foreground/15 px-[7px] py-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground"
										>{g.type}</span
									>
								</div>
							{/each}
						</div>
					{/if}

					{#if doc.settlement?.length}
						<div class={railCard}>
							<div class="{railLabel} mb-3">Settlement</div>
							{#each doc.settlement as r, i (i)}
								{@const tone = settlementTone(r.label)}
								<div class="flex items-center justify-between py-1.5">
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
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
