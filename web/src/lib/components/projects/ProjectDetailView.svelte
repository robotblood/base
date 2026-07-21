<script lang="ts">
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import {
		STAGES,
		dueInfo,
		progress,
		healthVM,
		stageOf,
		fmtISO,
		phaseColor,
		phaseFill,
		filePreview,
		initials,
		LINK_CODE_MAP,
		type Project
	} from '$lib/projects/data';
	import AudioFileRow from './AudioFileRow.svelte';
	import MediaThumb from './MediaThumb.svelte';
	import ProjectRundown from './ProjectRundown.svelte';
	import LayoutPanelLeft from '@lucide/svelte/icons/layout-panel-left';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { t, p }: { t: Tracker; p: Project } = $props();

	const st = $derived(stageOf(p.status));
	const du = $derived(dueInfo(p.due, p.status));
	const h = $derived(healthVM(p.health));
	const pct = $derived(progress(p));
	const isLive = $derived(!!p.rundown);
	const showRundown = $derived(isLive && t.wsTab === 'rundown');

	const doneCount = $derived(p.tasks.filter((x) => x.done).length);

	const nextDue = $derived.by(() => {
		const up: { date: string; title: string; kind: string }[] = [];
		p.tasks.forEach((x) => {
			if (!x.done && x.due) up.push({ date: x.due, title: x.title, kind: 'Task' });
		});
		p.milestones.forEach((m) => {
			if (!m.done && m.date) up.push({ date: m.date, title: m.name, kind: 'Milestone' });
		});
		up.sort((a, b) => (a.date < b.date ? -1 : 1));
		return up.slice(0, 3);
	});

	const cardClass = 'rounded-[12px] border bg-card p-[18px_20px]';
	const sectionLabel = 'font-mono text-[11px] tracking-[0.12em] text-muted-foreground';
	const kindLabel = $derived((p.year ? p.year + ' · ' : '') + p.kind);
</script>

<div class="px-9 pb-16 pt-6">
	<button
		onclick={t.goList}
		class="mb-5 inline-flex cursor-pointer items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground hover:text-foreground/70"
	>
		<ArrowLeft class="size-3.5" /> PROJECTS
	</button>

	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-5">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-3">
				<span
					class="rounded-[6px] px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-white"
					style="background:{st.color};">{p.status}</span
				>
				<span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
					>{kindLabel}</span
				>
			</div>
			<h1 class="mt-3 text-[31px] font-extrabold tracking-[-0.02em]">{p.name}</h1>
		</div>
		<button
			onclick={() => (t.layout = t.layout === 'console' ? 'focus' : 'console')}
			class="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border bg-card px-3.5 py-[9px] text-[12px] font-semibold text-foreground/70 hover:border-ring/40"
		>
			<LayoutPanelLeft class="size-4" />
			{t.layout === 'console' ? 'Focus view' : 'Console view'}
		</button>
	</div>

	<!-- Meta row -->
	<div class="mt-5 flex flex-wrap items-center gap-x-[30px] gap-y-3 border-b pb-5">
		<div class="flex items-center gap-2.5">
			<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">PROGRESS</span>
			<span class="h-1.5 w-[130px] overflow-hidden rounded bg-muted"
				><span class="block h-full" style="width:{pct}%;background:{st.color};"></span></span
			>
			<span class="font-mono text-[12px] font-semibold text-foreground/70">{pct}%</span>
		</div>
		<div class="flex items-center gap-2 text-[12px]" style="color:{h.color};">
			<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">HEALTH</span>
			<span class="size-[7px] rounded-full" style="background:{h.color};"></span>{h.label}
		</div>
		<div class="flex items-center gap-2 font-mono text-[11px] font-semibold text-foreground/70">
			<span class="tracking-[0.1em] text-muted-foreground">DUE</span>
			<span style="color:{du.color};">{p.due ? fmtISO(p.due) : '—'} · {du.label}</span>
		</div>
		<div class="flex items-center gap-2 font-mono text-[11px] font-semibold text-foreground/70">
			<span class="tracking-[0.1em] text-muted-foreground">START</span>
			<span>{p.start ? fmtISO(p.start) : '—'}</span>
		</div>
	</div>

	<!-- Status pipeline pills -->
	<div class="my-6 flex flex-wrap gap-2">
		{#each STAGES as s (s.key)}
			<button
				onclick={() => t.setStatus(p.id, s.key)}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-[20px] border px-3 py-[7px] text-[12.5px] font-medium {s.key ===
				p.status
					? 'border-transparent text-white'
					: 'text-foreground/70'}"
				style={s.key === p.status ? `background:${s.color};` : ''}
			>
				<span class="size-[7px] rounded-full" style="background:{s.color};"></span>{s.key}
			</button>
		{/each}
	</div>

	<!-- Live-project tabs -->
	{#if isLive}
		<div class="mb-[22px] inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
			<button
				onclick={() => (t.wsTab = 'overview')}
				class="cursor-pointer rounded-[7px] px-4 py-2 text-[12px] font-semibold {t.wsTab !== 'rundown'
					? 'bg-primary text-primary-foreground'
					: 'text-foreground/70'}">Overview</button
			>
			<button
				onclick={() => (t.wsTab = 'rundown')}
				class="cursor-pointer rounded-[7px] px-4 py-2 text-[12px] font-semibold {t.wsTab === 'rundown'
					? 'bg-primary text-primary-foreground'
					: 'text-foreground/70'}">Show Rundown</button
			>
		</div>
	{/if}

	{#if showRundown}
		<ProjectRundown {t} {p} />
	{:else}
		<!-- OVERVIEW -->
		<div
			class="grid items-start gap-5"
			style={t.layout === 'console'
				? 'grid-template-columns:1.7fr 1fr;'
				: 'grid-template-columns:minmax(0,760px);justify-content:center;'}
		>
			<!-- Left column -->
			<div class="flex min-w-0 flex-col gap-5">
				<!-- Phases -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-4">PHASES</div>
					<div class="flex gap-[9px]">
						{#each p.phases as ph (ph.name)}
							<div class="flex-1">
								<div class="h-1.5 overflow-hidden rounded bg-muted">
									<div class="h-full" style="width:{phaseFill(ph.status)}%;background:{phaseColor(ph.status)};"></div>
								</div>
								<div
									class="mt-[9px] font-mono text-[10px] uppercase leading-[1.3] tracking-[0.04em] text-foreground/70"
								>
									{ph.name}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Up next -->
				{#if nextDue.length}
					<div class="rounded-[12px] border border-signal/30 bg-signal/10 p-[18px_20px]">
						<div class="mb-1.5 font-mono text-[11px] tracking-[0.12em] text-signal">UP NEXT</div>
						{#each nextDue as n (n.title)}
							{@const nd = dueInfo(n.date, p.status)}
							<div class="flex items-center gap-3 border-t border-signal/20 py-[11px] first:border-t-0">
								<span class="w-[72px] font-mono text-[9px] uppercase tracking-[0.1em] text-signal"
									>{n.kind}</span
								>
								<span class="flex-1 text-[14px]">{n.title}</span>
								<span class="font-mono text-[12px] font-semibold" style="color:{nd.color};"
									>{nd.label}</span
								>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Tasks -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">
						TASKS <span class="text-muted-foreground/70">· {doneCount}/{p.tasks.length}</span>
					</div>
					{#each p.tasks as task (task.id)}
						{@const td = dueInfo(task.due, task.done ? 'Complete' : p.status)}
						<div class="flex items-center gap-3 border-t py-2.5 first:border-t-0">
							<button
								onclick={() => t.toggleTask(p.id, task.id)}
								class="grid size-[19px] flex-none place-items-center rounded-[5px] border-[1.5px]"
								style={task.done
									? 'background:#2f7d5b;border-color:#2f7d5b;'
									: 'background:transparent;border-color:#c9c3b4;'}
							>
								{#if task.done}<span class="text-[12px] leading-none text-white">✓</span>{/if}
							</button>
							<span
								class="flex-1 text-[14px] {task.done
									? 'text-muted-foreground line-through'
									: ''}">{task.title}</span
							>
							<span class="font-mono text-[11px]" style="color:{td.color};">{task.due ? td.label : ''}</span>
						</div>
					{/each}
				</div>

				<!-- Milestones -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">MILESTONES</div>
					{#each p.milestones as m (m.name)}
						<div class="flex items-center gap-3 border-t py-2.5 first:border-t-0">
							<span
								class="size-[11px] flex-none rounded-full"
								style="background:{m.done ? '#2f7d5b' : '#cfc9bb'};"
							></span>
							<span class="flex-1 text-[14px] {m.done ? 'text-foreground/70' : ''}">{m.name}</span>
							<span class="font-mono text-[11px] text-muted-foreground">{fmtISO(m.date)}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Right column -->
			<div class="flex min-w-0 flex-col gap-5">
				<!-- Details -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-3.5">DETAILS</div>
					{#if p.source}
						<div class="flex gap-3 py-1.5">
							<span
								class="w-[58px] flex-none font-mono text-[10px] leading-[1.4] tracking-[0.06em] text-muted-foreground"
								>SOURCE</span
							>
							<span class="break-all font-mono text-[12px] leading-[1.4] text-foreground/70"
								>{p.source}</span
							>
						</div>
					{/if}
					<div class="flex gap-3 py-1.5">
						<span
							class="w-[58px] flex-none font-mono text-[10px] leading-[1.4] tracking-[0.06em] text-muted-foreground"
							>PATH</span
						>
						<span class="min-w-0 flex-1 break-all font-mono text-[12px] leading-[1.4] text-foreground/70"
							>{p.path || '—'}</span
						>
						<div class="flex flex-none gap-1 self-start">
							{#if p.path}
								<button
									onclick={() => t.openLocal(p.id)}
									title="Open folder in file manager"
									class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
									>OPEN</button
								>
							{/if}
							<button
								onclick={() => t.openPicker(p.id)}
								title="Link this project to a folder"
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
								>{p.path ? 'CHANGE' : 'SET'}</button
							>
						</div>
					</div>
					<div class="flex gap-3 py-1.5">
						<span
							class="w-[58px] flex-none font-mono text-[10px] leading-[1.4] tracking-[0.06em] text-muted-foreground"
							>SUMMARY</span
						>
						<span class="text-[13px] leading-[1.5] text-foreground/70">{p.summary || '—'}</span>
					</div>
				</div>

				<!-- People -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">PEOPLE</div>
					{#each p.people as pe (pe.name + pe.role)}
						<div class="flex items-center gap-3 border-t py-2 first:border-t-0">
							<span
								class="grid size-7 place-items-center rounded-full bg-secondary font-mono text-[10px] text-foreground/70"
								>{initials(pe.name)}</span
							>
							<span class="flex-1 text-[13.5px]">{pe.name}</span>
							<span class="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground"
								>{pe.role}</span
							>
						</div>
					{/each}
				</div>

				<!-- Notes & meetings -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">NOTES &amp; MEETINGS</div>
					{#each p.notes as n (n.title + n.date)}
						<div class="border-t py-[11px] first:border-t-0">
							<div class="flex justify-between gap-2">
								<span class="text-[13.5px] font-semibold">{n.title}</span>
								<span class="font-mono text-[10px] text-muted-foreground">{fmtISO(n.date)}</span>
							</div>
							<div class="mt-1.5 text-[13px] leading-[1.5] text-foreground/70">{n.body}</div>
						</div>
					{:else}
						<div class="pt-1.5 text-[13px] text-muted-foreground">No notes yet.</div>
					{/each}
				</div>

				<!-- Files -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5 flex items-center gap-2">
						FILES
						{#if t.watching}
							<span class="inline-flex items-center gap-1 text-[9px] text-[#2f7d5b]" title="Watching this folder — the list refreshes when files change">
								<span class="size-1.5 animate-pulse rounded-full bg-[#2f7d5b]"></span>LIVE
							</span>
						{/if}
					</div>
					{#each p.files as f (f.rel ?? f.name)}
						{#if f.kind === 'audio' && f.rel}
							{#key f.rel}
								<AudioFileRow {t} pid={p.id} file={f} />
							{/key}
						{:else}
							{@const pv = filePreview(f.name)}
							<div class="group flex items-center gap-3 border-t py-2.5 first:border-t-0">
								<MediaThumb pid={p.id} file={f} size={40} ver={t.fileVer[p.id] ?? 0} />
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13.5px]">{f.name}</div>
								<div class="mt-[3px] font-mono text-[10px] text-muted-foreground">{pv.ext} · {f.meta}</div>
							</div>
							{#if f.rel}
								<div class="hidden flex-none gap-1 group-hover:flex">
									<button
										onclick={() => t.openLocal(p.id, f.rel)}
										title="Open in native app"
										class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
										>OPEN</button
									>
									<button
										onclick={() => t.openLocal(p.id, f.rel, 'reveal')}
										title="Reveal in file manager"
										class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
										>REVEAL</button
									>
								</div>
							{/if}
							</div>
						{/if}
					{:else}
						<div class="pt-1.5 text-[13px] text-muted-foreground">
							{#if p.path}
								No previewable files in this folder.
							{:else}
								<button
									onclick={() => t.openPicker(p.id)}
									class="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground/80"
									>Link a folder</button
								> to preview its files here.
							{/if}
						</div>
					{/each}
				</div>

				<!-- Linked items -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">LINKED ITEMS</div>
					{#each p.linked as l (l.title)}
						{@const cm = LINK_CODE_MAP[l.type] ?? LINK_CODE_MAP.note}
						<div class="flex items-center gap-3 border-t py-2.5 first:border-t-0">
							<span
								class="rounded-[4px] px-1.5 py-[3px] font-mono text-[9px] tracking-[0.06em] text-white"
								style="background:{cm.color};">{cm.code}</span
							>
							<span class="flex-1 text-[13.5px]">{l.title}</span>
							<span class="rounded-full bg-accent px-2.5 py-[3px] text-[11px] text-foreground/70"
								>{l.status}</span
							>
						</div>
					{:else}
						<div class="pt-1.5 text-[13px] text-muted-foreground">Nothing linked.</div>
					{/each}
				</div>

				<!-- Activity -->
				<div class={cardClass}>
					<div class="{sectionLabel} mb-2">ACTIVITY</div>
					{#each p.activity as a (a.date + a.text)}
						<div class="flex gap-3 py-[7px]">
							<span class="w-[50px] flex-none font-mono text-[10px] leading-[1.4] text-muted-foreground"
								>{fmtISO(a.date)}</span
							>
							<span class="flex-1 text-[13px] text-foreground/70">{a.text}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
