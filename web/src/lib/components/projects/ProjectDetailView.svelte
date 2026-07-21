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
	import { kindInfo } from '$lib/projects/kinds';
	import AudioFileRow from './AudioFileRow.svelte';
	import FileRowActions from './FileRowActions.svelte';
	import MediaThumb from './MediaThumb.svelte';
	import ProjectRundown from './ProjectRundown.svelte';
	import LayoutPanelLeft from '@lucide/svelte/icons/layout-panel-left';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import X from '@lucide/svelte/icons/x';

	let { t, p }: { t: Tracker; p: Project } = $props();

	const st = $derived(stageOf(p.status));
	const du = $derived(dueInfo(p.due, p.status));
	const h = $derived(healthVM(p.health));
	const pct = $derived(progress(p));
	const showRundown = $derived(t.wsTab === 'rundown');

	const info = $derived(kindInfo(p.kind));
	const fam = $derived(info.family);

	const doneCount = $derived(p.tasks.filter((x) => x.done).length);
	const children = $derived(t.childrenOf(p.id));
	const parent = $derived(p.parentId ? t.find(p.parentId) : undefined);
	const linkable = $derived(
		t.projects.filter((x) => x.id !== p.id && !x.parentId && x.id !== p.parentId)
	);
	const links = $derived(p.details?.links ?? []);

	// Visual family: images/videos become a tile grid; everything else stays rows.
	const gridFiles = $derived(
		fam === 'visual' ? p.files.filter((f) => f.rel && (f.kind === 'image' || f.kind === 'video')) : []
	);
	const rowFiles = $derived(p.files.filter((f) => !gridFiles.includes(f)));

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

	// Draft state for the add rows.
	let taskDraft = $state({ title: '', due: '' });
	let msDraft = $state({ name: '', date: '' });
	let childDraft = $state('');
	let linkSel = $state('');
	let linkDraft = $state({ label: '', url: '' });
	let dlDraft = $state({ name: '', spec: '' });

	function submitTask() {
		if (!taskDraft.title.trim()) return;
		void t.addTask(p.id, taskDraft.title, taskDraft.due);
		taskDraft = { title: '', due: '' };
	}
	function submitMilestone() {
		if (!msDraft.name.trim()) return;
		t.addMilestone(p.id, msDraft.name, msDraft.date);
		msDraft = { name: '', date: '' };
	}
	function submitChild() {
		if (!childDraft.trim()) return;
		void t.createChild(p.id, childDraft);
		childDraft = '';
	}
	function submitLink() {
		if (!linkDraft.url.trim()) return;
		t.addLink(p.id, linkDraft.label, linkDraft.url);
		linkDraft = { label: '', url: '' };
	}
	function submitDeliverable() {
		if (!dlDraft.name.trim()) return;
		t.addDeliverable(p.id, dlDraft.name, dlDraft.spec);
		dlDraft = { name: '', spec: '' };
	}

	const cardClass = 'rounded-[12px] border bg-card p-[18px_20px]';
	const sectionLabel = 'font-mono text-[11px] tracking-[0.12em] text-muted-foreground';
	const ghost =
		'rounded-[5px] border border-transparent bg-transparent outline-none hover:border-border focus:border-ring';
	const ghostBtn =
		'cursor-pointer font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground/70';
	const rowX = 'hidden flex-none cursor-pointer text-muted-foreground hover:text-destructive';
	const addInput =
		'min-w-0 flex-1 rounded-[7px] border bg-card px-2.5 py-[7px] text-[13px] outline-none focus:border-ring';
	const addBtn =
		'cursor-pointer rounded-[7px] bg-primary px-3.5 py-[7px] text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40';
	const kindLabel = $derived((p.year ? p.year + ' · ' : '') + info.label);
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
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-3">
				<span
					class="rounded-[6px] px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-white"
					style="background:{st.color};">{p.status}</span
				>
				<span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
					>{kindLabel}</span
				>
				{#if parent}
					<button
						onclick={() => t.openProject(parent.id)}
						class="inline-flex cursor-pointer items-center gap-1 rounded-[6px] border px-2 py-[4px] font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
						title="Open the parent project"
					>
						Part of {parent.name}
						<ArrowUpRight class="size-3" />
					</button>
				{/if}
			</div>
			<input
				value={p.name}
				onchange={(e) => t.rename(p.id, e.currentTarget.value)}
				aria-label="Project name"
				class="{ghost} -mx-1 mt-2 w-full px-1 text-[31px] font-extrabold tracking-[-0.02em]"
			/>
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

	<!-- Overview / rundown tabs -->
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
				: 'text-foreground/70'}">{info.rundownLabel}</button
		>
	</div>

	{#if showRundown}
		<ProjectRundown {t} {p} />
	{:else}
		<!-- OVERVIEW — card snippets, ordered per layout family -->

		{#snippet phasesC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-4 flex items-center justify-between">
					<span>PHASES</span>
					<button onclick={() => t.addPhase(p.id)} class={ghostBtn}>+ Add</button>
				</div>
				<div class="flex flex-wrap gap-[9px]">
					{#each p.phases as ph, i (i)}
						<div class="group/ph min-w-[90px] flex-1">
							<button
								onclick={() => t.cyclePhase(p.id, i)}
								title="Click to advance: to-do → active → done"
								class="block h-1.5 w-full cursor-pointer overflow-hidden rounded bg-muted"
							>
								<span
									class="block h-full"
									style="width:{phaseFill(ph.status)}%;background:{phaseColor(ph.status)};"
								></span>
							</button>
							<div class="mt-[6px] flex items-center gap-1">
								<input
									value={ph.name}
									onchange={(e) => t.renamePhase(p.id, i, e.currentTarget.value)}
									aria-label="Phase name"
									class="{ghost} w-full min-w-0 px-1 py-0.5 font-mono text-[10px] uppercase leading-[1.3] tracking-[0.04em] text-foreground/70"
								/>
								<button
									onclick={() => t.removePhase(p.id, i)}
									title="Remove phase"
									class="{rowX} group-hover/ph:block"><X class="size-3" /></button
								>
							</div>
						</div>
					{:else}
						<div class="text-[13px] text-muted-foreground">No phases — add the shape of the work.</div>
					{/each}
				</div>
			</div>
		{/snippet}

		{#snippet upNextC()}
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
		{/snippet}

		{#snippet tasksC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5">
					TASKS <span class="text-muted-foreground/70">· {doneCount}/{p.tasks.length}</span>
				</div>
				{#each p.tasks as task (task.id)}
					{@const td = dueInfo(task.due, task.done ? 'Complete' : p.status)}
					<div class="group/tk flex items-center gap-3 border-t py-2 first:border-t-0">
						<button
							onclick={() => t.toggleTask(p.id, task.id)}
							class="grid size-[19px] flex-none place-items-center rounded-[5px] border-[1.5px]"
							style={task.done
								? 'background:#2f7d5b;border-color:#2f7d5b;'
								: 'background:transparent;border-color:#c9c3b4;'}
						>
							{#if task.done}<span class="text-[12px] leading-none text-white">✓</span>{/if}
						</button>
						<input
							value={task.title}
							onchange={(e) => t.updateTask(p.id, task.id, { title: e.currentTarget.value })}
							aria-label="Task title"
							class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[14px] {task.done
								? 'text-muted-foreground line-through'
								: ''}"
						/>
						{#if task.due}
							<span class="flex-none font-mono text-[11px]" style="color:{td.color};">{td.label}</span>
						{/if}
						<input
							type="date"
							value={task.due}
							onchange={(e) => t.updateTask(p.id, task.id, { due: e.currentTarget.value })}
							aria-label="Task due date"
							class="{ghost} hidden w-[130px] flex-none px-1 py-0.5 font-mono text-[11px] text-muted-foreground group-hover/tk:block"
						/>
						<button
							onclick={() => t.removeTask(p.id, task.id)}
							title="Delete task"
							class="{rowX} group-hover/tk:block"><X class="size-3.5" /></button
						>
					</div>
				{/each}
				<div class="mt-2 flex items-center gap-2 border-t pt-3">
					<input
						bind:value={taskDraft.title}
						onkeydown={(e) => e.key === 'Enter' && submitTask()}
						placeholder="Add a task…"
						class={addInput}
					/>
					<input
						type="date"
						bind:value={taskDraft.due}
						aria-label="Due date"
						class="w-[140px] flex-none rounded-[7px] border bg-card px-2 py-[7px] font-mono text-[11px] text-muted-foreground outline-none focus:border-ring"
					/>
					<button onclick={submitTask} disabled={!taskDraft.title.trim()} class={addBtn}>Add</button>
				</div>
			</div>
		{/snippet}

		{#snippet tracksC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5">
					{info.umbrellaLabel.toUpperCase()}
					{#if children.length}<span class="text-muted-foreground/70">· {children.length}</span>{/if}
				</div>
				{#each children as c (c.id)}
					{@const cst = stageOf(c.status)}
					{@const cpct = progress(c)}
					<div class="group/ch flex items-center gap-3 border-t py-2.5 first:border-t-0">
						<span class="size-[9px] flex-none rounded-full" style="background:{cst.color};"></span>
						<button
							onclick={() => t.openProject(c.id)}
							class="min-w-0 flex-1 cursor-pointer truncate text-left text-[14px] hover:underline"
							>{c.name}</button
						>
						<span class="flex w-[110px] flex-none items-center gap-2">
							<span class="h-1 flex-1 overflow-hidden rounded bg-muted"
								><span class="block h-full" style="width:{cpct}%;background:{cst.color};"></span></span
							>
							<span class="w-[30px] font-mono text-[10px] text-muted-foreground">{cpct}%</span>
						</span>
						<button
							onclick={() => t.linkParent(c.id, undefined)}
							title="Unlink from this project (keeps the project)"
							class="{rowX} group-hover/ch:block"><X class="size-3.5" /></button
						>
					</div>
				{:else}
					<div class="pt-1.5 text-[13px] text-muted-foreground">
						Nothing linked — songs, cuts, or sub-projects live on their own and roll up here.
					</div>
				{/each}
				<div class="mt-2 flex flex-wrap items-center gap-2 border-t pt-3">
					<input
						bind:value={childDraft}
						onkeydown={(e) => e.key === 'Enter' && submitChild()}
						placeholder="New linked project…"
						class="{addInput} min-w-[140px]"
					/>
					<button onclick={submitChild} disabled={!childDraft.trim()} class={addBtn}>Create</button>
					<select
						bind:value={linkSel}
						onchange={() => {
							if (linkSel) t.linkParent(linkSel, p.id);
							linkSel = '';
						}}
						aria-label="Link an existing project"
						class="max-w-[180px] flex-none rounded-[7px] border bg-card px-2 py-[7px] text-[12px] text-muted-foreground outline-none focus:border-ring"
					>
						<option value="">Link existing…</option>
						{#each linkable as lp (lp.id)}
							<option value={lp.id}>{lp.name}</option>
						{/each}
					</select>
				</div>
			</div>
		{/snippet}

		{#snippet milestonesC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5">MILESTONES</div>
				{#each p.milestones as m, i (i)}
					<div class="group/ms flex items-center gap-3 border-t py-2 first:border-t-0">
						<button
							onclick={() => t.toggleMilestone(p.id, i)}
							title={m.done ? 'Mark not reached' : 'Mark reached'}
							class="size-[11px] flex-none cursor-pointer rounded-full"
							style="background:{m.done ? '#2f7d5b' : '#cfc9bb'};"
						></button>
						<input
							value={m.name}
							onchange={(e) => t.updateMilestone(p.id, i, { name: e.currentTarget.value })}
							aria-label="Milestone name"
							class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[14px] {m.done ? 'text-foreground/70' : ''}"
						/>
						<span class="flex-none font-mono text-[11px] text-muted-foreground group-hover/ms:hidden"
							>{m.date ? fmtISO(m.date) : '—'}</span
						>
						<input
							type="date"
							value={m.date}
							onchange={(e) => t.updateMilestone(p.id, i, { date: e.currentTarget.value })}
							aria-label="Milestone date"
							class="{ghost} hidden w-[130px] flex-none px-1 py-0.5 font-mono text-[11px] text-muted-foreground group-hover/ms:block"
						/>
						<button
							onclick={() => t.removeMilestone(p.id, i)}
							title="Delete milestone"
							class="{rowX} group-hover/ms:block"><X class="size-3.5" /></button
						>
					</div>
				{:else}
					<div class="pt-1.5 text-[13px] text-muted-foreground">No milestones yet.</div>
				{/each}
				<div class="mt-2 flex items-center gap-2 border-t pt-3">
					<input
						bind:value={msDraft.name}
						onkeydown={(e) => e.key === 'Enter' && submitMilestone()}
						placeholder="Add a milestone…"
						class={addInput}
					/>
					<input
						type="date"
						bind:value={msDraft.date}
						aria-label="Milestone date"
						class="w-[140px] flex-none rounded-[7px] border bg-card px-2 py-[7px] font-mono text-[11px] text-muted-foreground outline-none focus:border-ring"
					/>
					<button onclick={submitMilestone} disabled={!msDraft.name.trim()} class={addBtn}>Add</button>
				</div>
			</div>
		{/snippet}

		{#snippet detailsC()}
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
						class="w-[58px] flex-none pt-1 font-mono text-[10px] leading-[1.4] tracking-[0.06em] text-muted-foreground"
						>SUMMARY</span
					>
					<textarea
						value={p.summary}
						rows="2"
						placeholder="What is this project?"
						onchange={(e) => t.setSummary(p.id, e.currentTarget.value)}
						class="{ghost} min-w-0 flex-1 resize-y px-1 py-0.5 text-[13px] leading-[1.5] text-foreground/70"
					></textarea>
				</div>
			</div>
		{/snippet}

		{#snippet linksC()}
			{#if fam === 'software' || links.length}
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">LINKS</div>
					{#each links as l, i (i)}
						<div class="group/lk flex items-center gap-3 border-t py-2 first:border-t-0">
							<a
								href={l.url}
								target="_blank"
								rel="noopener noreferrer"
								class="flex-none text-[13px]"
								style="color:#3a6ea5;"
								title={l.url}><ArrowUpRight class="size-4" /></a
							>
							<input
								value={l.label}
								onchange={(e) => t.updateLink(p.id, i, { label: e.currentTarget.value })}
								aria-label="Link label"
								class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[13.5px]"
							/>
							<input
								value={l.url}
								onchange={(e) => t.updateLink(p.id, i, { url: e.currentTarget.value })}
								aria-label="Link URL"
								class="{ghost} hidden w-[150px] flex-none px-1 py-0.5 font-mono text-[10px] text-muted-foreground group-hover/lk:block"
							/>
							<button
								onclick={() => t.removeLink(p.id, i)}
								title="Remove link"
								class="{rowX} group-hover/lk:block"><X class="size-3.5" /></button
							>
						</div>
					{:else}
						<div class="pt-1.5 text-[13px] text-muted-foreground">
							Repo, deployed URL, design file…
						</div>
					{/each}
					<div class="mt-2 flex items-center gap-2 border-t pt-3">
						<input
							bind:value={linkDraft.label}
							placeholder="Label"
							class="{addInput} max-w-[110px]"
						/>
						<input
							bind:value={linkDraft.url}
							onkeydown={(e) => e.key === 'Enter' && submitLink()}
							placeholder="https://…"
							class={addInput}
						/>
						<button onclick={submitLink} disabled={!linkDraft.url.trim()} class={addBtn}>Add</button>
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet specsC()}
			{#if info.key === 'print'}
				{@const sp = p.details?.print ?? {}}
				{@const specRows = [
					{ key: 'size', label: 'SIZE', ph: '18×24 in' },
					{ key: 'bleed', label: 'BLEED', ph: '0.125 in' },
					{ key: 'color', label: 'COLOR', ph: 'CMYK' },
					{ key: 'stock', label: 'STOCK', ph: '100# gloss cover' },
					{ key: 'qty', label: 'QTY', ph: '500' },
					{ key: 'vendor', label: 'VENDOR', ph: 'printer / shop' }
				]}
				<div class={cardClass}>
					<div class="{sectionLabel} mb-2">PRINT SPECS</div>
					{#each specRows as row (row.key)}
						<div class="flex items-center gap-3 py-1">
							<span
								class="w-[58px] flex-none font-mono text-[10px] tracking-[0.06em] text-muted-foreground"
								>{row.label}</span
							>
							<input
								value={(sp as Record<string, string>)[row.key] ?? ''}
								placeholder={row.ph}
								onchange={(e) => t.setPrintSpec(p.id, { [row.key]: e.currentTarget.value })}
								aria-label={row.label}
								class="{ghost} min-w-0 flex-1 px-1 py-0.5 font-mono text-[12px] text-foreground/70"
							/>
						</div>
					{/each}
					<div class="flex items-center gap-3 py-1">
						<span
							class="w-[58px] flex-none font-mono text-[10px] tracking-[0.06em] text-muted-foreground"
							>PROOF</span
						>
						<input
							type="date"
							value={sp.proofDue ?? ''}
							onchange={(e) => t.setPrintSpec(p.id, { proofDue: e.currentTarget.value })}
							aria-label="Proof deadline"
							class="{ghost} flex-none px-1 py-0.5 font-mono text-[12px] text-foreground/70"
						/>
						{#if sp.proofDue}
							{@const pd = dueInfo(sp.proofDue, p.status)}
							<span class="font-mono text-[11px]" style="color:{pd.color};">{pd.label}</span>
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet deliverablesC()}
			{#if info.key === 'video' || info.key === 'motion graphics'}
				{@const ds = p.details?.deliverables ?? []}
				{@const dDone = ds.filter((x) => x.done).length}
				<div class={cardClass}>
					<div class="{sectionLabel} mb-1.5">
						DELIVERABLES
						{#if ds.length}<span class="text-muted-foreground/70">· {dDone}/{ds.length}</span>{/if}
					</div>
					{#each ds as d, i (i)}
						<div class="group/dl flex items-center gap-3 border-t py-2 first:border-t-0">
							<button
								onclick={() => t.toggleDeliverable(p.id, i)}
								title={d.done ? 'Mark not delivered' : 'Mark delivered'}
								class="grid size-[19px] flex-none place-items-center rounded-[5px] border-[1.5px]"
								style={d.done
									? 'background:#2f7d5b;border-color:#2f7d5b;'
									: 'background:transparent;border-color:#c9c3b4;'}
							>
								{#if d.done}<span class="text-[12px] leading-none text-white">✓</span>{/if}
							</button>
							<input
								value={d.name}
								onchange={(e) => t.updateDeliverable(p.id, i, { name: e.currentTarget.value })}
								aria-label="Deliverable name"
								class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[13.5px] {d.done
									? 'text-muted-foreground line-through'
									: ''}"
							/>
							<input
								value={d.spec}
								placeholder="16:9 · 4K · ProRes"
								onchange={(e) => t.updateDeliverable(p.id, i, { spec: e.currentTarget.value })}
								aria-label="Deliverable spec"
								class="{ghost} w-[130px] flex-none px-1 py-0.5 text-right font-mono text-[10px] text-muted-foreground"
							/>
							<button
								onclick={() => t.removeDeliverable(p.id, i)}
								title="Remove deliverable"
								class="{rowX} group-hover/dl:block"><X class="size-3.5" /></button
							>
						</div>
					{:else}
						<div class="pt-1.5 text-[13px] text-muted-foreground">
							The cuts this project owes: master, verticals, thumbnails…
						</div>
					{/each}
					<div class="mt-2 flex items-center gap-2 border-t pt-3">
						<input
							bind:value={dlDraft.name}
							onkeydown={(e) => e.key === 'Enter' && submitDeliverable()}
							placeholder="Add a deliverable…"
							class={addInput}
						/>
						<input
							bind:value={dlDraft.spec}
							onkeydown={(e) => e.key === 'Enter' && submitDeliverable()}
							placeholder="spec"
							class="{addInput} max-w-[120px] font-mono text-[11px]"
						/>
						<button onclick={submitDeliverable} disabled={!dlDraft.name.trim()} class={addBtn}
							>Add</button
						>
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet peopleC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5 flex items-center justify-between">
					<span>PEOPLE</span>
					<button onclick={() => t.addPerson(p.id)} class={ghostBtn}>+ Add</button>
				</div>
				{#each p.people as pe, i (i)}
					<div class="group/pe flex items-center gap-3 border-t py-2 first:border-t-0">
						<span
							class="grid size-7 flex-none place-items-center rounded-full bg-secondary font-mono text-[10px] text-foreground/70"
							>{initials(pe.name || '?')}</span
						>
						<input
							value={pe.name}
							onchange={(e) => t.updatePerson(p.id, i, { name: e.currentTarget.value })}
							aria-label="Person name"
							class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[13.5px]"
						/>
						<input
							value={pe.role}
							onchange={(e) => t.updatePerson(p.id, i, { role: e.currentTarget.value })}
							aria-label="Role"
							class="{ghost} w-[90px] flex-none px-1 py-0.5 text-right font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground"
						/>
						<button
							onclick={() => t.removePerson(p.id, i)}
							title="Remove person"
							class="{rowX} group-hover/pe:block"><X class="size-3.5" /></button
						>
					</div>
				{:else}
					<div class="pt-1.5 text-[13px] text-muted-foreground">No people yet.</div>
				{/each}
			</div>
		{/snippet}

		{#snippet notesC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5 flex items-center justify-between">
					<span>NOTES &amp; MEETINGS</span>
					<button onclick={() => t.addNote(p.id)} class={ghostBtn}>+ Add</button>
				</div>
				{#each p.notes as n, i (i)}
					<div class="group/nt border-t py-[11px] first:border-t-0">
						<div class="flex items-center justify-between gap-2">
							<input
								value={n.title}
								onchange={(e) => t.updateNote(p.id, i, { title: e.currentTarget.value })}
								aria-label="Note title"
								class="{ghost} min-w-0 flex-1 px-1 py-0.5 text-[13.5px] font-semibold"
							/>
							<span class="flex-none font-mono text-[10px] text-muted-foreground">{fmtISO(n.date)}</span>
							<button
								onclick={() => t.removeNote(p.id, i)}
								title="Delete note"
								class="{rowX} group-hover/nt:block"><X class="size-3.5" /></button
							>
						</div>
						<textarea
							value={n.body}
							rows="2"
							placeholder="Write it down…"
							onchange={(e) => t.updateNote(p.id, i, { body: e.currentTarget.value })}
							class="{ghost} mt-1 w-full resize-y px-1 py-0.5 text-[13px] leading-[1.5] text-foreground/70"
						></textarea>
					</div>
				{:else}
					<div class="pt-1.5 text-[13px] text-muted-foreground">No notes yet.</div>
				{/each}
			</div>
		{/snippet}

		{#snippet filesC()}
			<div class={cardClass}>
				<div class="{sectionLabel} mb-1.5 flex items-center gap-2">
					{fam === 'visual' ? 'MEDIA' : 'FILES'}
					{#if t.watching}
						<span class="inline-flex items-center gap-1 text-[9px] text-[#2f7d5b]" title="Watching this folder — the list refreshes when files change">
							<span class="size-1.5 animate-pulse rounded-full bg-[#2f7d5b]"></span>LIVE
						</span>
					{/if}
				</div>
				{#if gridFiles.length}
					<div class="mb-2 grid grid-cols-3 gap-2.5 pt-1.5 sm:grid-cols-4">
						{#each gridFiles as f (f.rel)}
							<button
								onclick={() => t.openLocal(p.id, f.rel)}
								title="Open {f.name} in native app"
								class="group/tile relative aspect-square cursor-pointer overflow-hidden rounded-[10px] border bg-muted"
							>
								<img
									src="/projects/{p.id}/thumb?p={encodeURIComponent(f.rel!)}&w=300&v={t.fileVer[p.id] ?? 0}"
									alt={f.name}
									loading="lazy"
									class="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-105"
								/>
								<span
									class="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-left font-mono text-[9px] text-white opacity-0 transition-opacity group-hover/tile:opacity-100"
									>{f.name}</span
								>
							</button>
						{/each}
					</div>
				{/if}
				{#each rowFiles as f (f.rel ?? f.name)}
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
								<FileRowActions {t} pid={p.id} file={f} />
							{/if}
						</div>
					{/if}
				{:else}
					{#if !gridFiles.length}
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
					{/if}
				{/each}
			</div>
		{/snippet}

		{#snippet linkedC()}
			{#if p.linked.length}
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
					{/each}
				</div>
			{/if}
		{/snippet}

		{#snippet activityC()}
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
		{/snippet}

		{@const left =
			fam === 'visual'
				? [filesC, phasesC, upNextC, tasksC, tracksC]
				: fam === 'software'
					? [tasksC, phasesC, upNextC, milestonesC, tracksC]
					: info.key === 'album'
						? [tracksC, phasesC, upNextC, tasksC, milestonesC]
						: [phasesC, upNextC, tasksC, tracksC, milestonesC]}
		{@const right =
			fam === 'visual'
				? [detailsC, specsC, deliverablesC, milestonesC, peopleC, notesC, linksC, linkedC, activityC]
				: fam === 'software'
					? [detailsC, linksC, notesC, peopleC, filesC, linkedC, activityC]
					: [detailsC, peopleC, notesC, filesC, linksC, linkedC, activityC]}
		<div
			class="grid items-start gap-5"
			style={t.layout === 'console'
				? 'grid-template-columns:1.7fr 1fr;'
				: 'grid-template-columns:minmax(0,760px);justify-content:center;'}
		>
			<div class="flex min-w-0 flex-col gap-5">
				{#each left as card, i (i)}{@render card()}{/each}
			</div>
			<div class="flex min-w-0 flex-col gap-5">
				{#each right as card, i (i)}{@render card()}{/each}
			</div>
		</div>
	{/if}
</div>
