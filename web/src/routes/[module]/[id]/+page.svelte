<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import { cn } from '$lib/utils';
	import { getModule, MODULE_CODES } from '$lib/modules';
	import { fmt } from '$lib/format';
	import ModuleFields from '$lib/components/ModuleFields.svelte';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface MediaItem {
		rel: string;
		name: string;
		kind: 'image' | 'video' | 'audio' | 'other';
		seq?: boolean;
		count?: number;
	}

	let { data }: { data: PageData } = $props();
	const mod = $derived(getModule(data.moduleKey)!);
	const item = $derived(data.item as Record<string, unknown>);
	const code = $derived(MODULE_CODES[mod.key] ?? '');
	const title = $derived(String(item[mod.titleField] ?? '') || `Untitled ${mod.singular}`);
	const base = $derived(`/${data.moduleKey}/${item.id}`);
	const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const enc = (s: string) => encodeURIComponent(s);

	const meta = $derived(
		(
			[
				['created', fmt(item.created_at)],
				['updated', fmt(item.updated_at)],
				['source', fmt(item.source)]
			] as [string, string][]
		).filter(([, v]) => v)
	);

	// The meta pairs as one mono line, matching the tracker's subtitle rhythm.
	const metaLine = $derived(meta.map(([k, v]) => `${k} ${v}`).join('  ·  '));

	const archive = $derived(
		item.raw && typeof item.raw === 'object' && 'path' in item.raw
			? (item.raw as Record<string, any>)
			: null
	);
	// A linked folder from either era: the first-class path column (wins) or
	// the imported raw snapshot. Gates the media gallery + folder actions.
	const folderPath = $derived(
		(typeof item.path === 'string' && item.path) || (archive?.path as string | undefined) || null
	);

	// The record's markdown document (modules with a docField). MarkdownField
	// owns the editor and its Doc/Markdown tabs; bodyText rides into the record
	// form via a hidden input below.
	let bodyText = $state('');
	// Sync from the record only when it's a different record — a refresh of the
	// same item must never clobber text being typed right now.
	let bodyDocId: unknown;
	$effect(() => {
		if (!mod.docField) return;
		if (item.id === bodyDocId) return;
		bodyDocId = item.id;
		bodyText = String(item[mod.docField] ?? '');
	});

	// ---- Autosave -----------------------------------------------------------
	// Every edit — fields or document — saves on its own after a short pause,
	// and any still-pending edit is flushed when you navigate away or close the
	// tab. Nothing is ever lost to a forgotten Save click.
	type SaveState = 'saved' | 'pending' | 'saving' | 'error';
	let saveState = $state<SaveState>('saved');
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSaved: string | null = null; // form snapshot as of the last successful save

	const formEl = () => document.getElementById('record-form') as HTMLFormElement | null;
	const snapshot = (fd: FormData) =>
		JSON.stringify([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));

	// Baseline the snapshot once the form for this record is in the DOM, so the
	// first autosave only fires on a real edit.
	$effect(() => {
		item.id;
		queueMicrotask(() => {
			const f = formEl();
			if (f) lastSaved = snapshot(new FormData(f));
		});
	});

	async function doSave(keepalive = false) {
		const f = formEl();
		if (!f) return;
		const fd = new FormData(f);
		const snap = snapshot(fd);
		if (snap === lastSaved) {
			if (saveState !== 'error') saveState = 'saved';
			return;
		}
		saveState = 'saving';
		try {
			const res = await fetch(`${base}?/update`, {
				method: 'POST',
				body: fd,
				keepalive,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				lastSaved = snap;
				// Edits made while the request was in flight → save again.
				const now = formEl();
				if (now && snapshot(new FormData(now)) !== snap) scheduleSave();
				else saveState = 'saved';
			} else {
				saveState = 'error';
				toast.error(
					String(
						(result.type === 'failure' && result.data?.message) || 'Autosave failed — retrying'
					)
				);
				scheduleSave(4000);
			}
		} catch {
			saveState = 'error';
			toast.error('Autosave failed — is the server up? Retrying…');
			scheduleSave(4000);
		}
	}

	function scheduleSave(delay = 800) {
		if (saveState !== 'saving') saveState = 'pending';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			void doSave();
		}, delay);
	}

	function flushNow(keepalive = false) {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
		void doSave(keepalive);
	}

	beforeNavigate(() => flushNow(true));
	function onLifecycleHide() {
		if (document.visibilityState === 'hidden') flushNow(true);
	}
	function saveDoc() {
		flushNow();
	}

	const saveLabel: Record<SaveState, string> = {
		saved: 'All changes saved',
		pending: 'Unsaved changes…',
		saving: 'Saving…',
		error: 'Save failed — will retry'
	};

	// Notes get a header strip: the fields you actually reach for (status high
	// on the page), with meeting type only shown for meetings. kindLive tracks
	// the select as it's edited so the strip reshapes immediately.
	// `parent_id` joins them so a document written inside a weekly note says so,
	// and can be re-filed, without digging into the full field list below.
	const STRIP_FIELDS = [
		'kind',
		'meeting_type',
		'status',
		'meeting_time',
		'project_id',
		'parent_id'
	];
	let kindLive = $state('');
	$effect(() => {
		item.id;
		kindLive = String(item.kind ?? '');
	});
	function syncKind() {
		const el = document.getElementById('kind') as HTMLSelectElement | null;
		if (el) kindLive = el.value;
	}
	const stripFields = $derived(
		mod.key === 'notes'
			? mod.fields.filter(
					(f) =>
						STRIP_FIELDS.includes(f.name) && (f.name !== 'meeting_type' || kindLive === 'meeting')
				)
			: []
	);

	// Product links + photo, rendered (not just stored) when present.
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
	const photoUrl = $derived(str(item.photo_url));
	const productLinks = $derived(
		(
			[
				['Product page', str(item.product_url)],
				['Support', str(item.support_url)],
				[mod.key === 'merch' ? 'Store' : 'Website', str(item.url)]
			] as [string, string | null][]
		).filter(([, v]) => v)
	);
	const detailExclude = $derived([
		...(mod.docField ? [mod.docField] : []),
		...(mod.key === 'notes' ? STRIP_FIELDS : [])
	]);

	let media = $state<MediaItem[]>([]);
	let mediaCapped = $state(false);
	let mediaLoading = $state(true);
	let mediaError = $state(false);

	const images = $derived(media.filter((m) => m.kind === 'image'));
	let lightbox = $state<number | null>(null);
	function openLightbox(rel: string) {
		const i = images.findIndex((m) => m.rel === rel);
		if (i >= 0) lightbox = i;
	}
	function closeLightbox() {
		lightbox = null;
	}
	function step(delta: number) {
		if (lightbox === null || !images.length) return;
		lightbox = (lightbox + delta + images.length) % images.length;
	}
	function onKey(e: KeyboardEvent) {
		if (lightbox === null) return;
		if (e.key === 'Escape') closeLightbox();
		else if (e.key === 'ArrowRight') step(1);
		else if (e.key === 'ArrowLeft') step(-1);
	}

	// Add-files into the linked folder: hidden picker + drag-drop on the Files
	// section; mediaVer retriggers the listing after an upload.
	let mediaVer = $state(0);
	let uploadBusy = $state(false);
	let dragOverFiles = $state(false);
	let recordFileInput = $state<HTMLInputElement | null>(null);
	async function uploadRecordFiles(list: FileList | null | undefined) {
		if (!list?.length) return;
		uploadBusy = true;
		try {
			const fd = new FormData();
			for (const f of list) fd.append('files', f);
			const res = await fetch(`${base}/upload`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
			const { saved } = (await res.json()) as { saved: string[] };
			toast.success(saved.length === 1 ? `Added ${saved[0]}` : `Added ${saved.length} files`);
			mediaVer++;
		} catch (e) {
			toast.error('Upload failed', { description: String(e) });
		} finally {
			uploadBusy = false;
		}
	}

	$effect(() => {
		if (!folderPath) {
			media = [];
			return;
		}
		mediaVer; // refetch after uploads
		lightbox = null;
		const url = `/${data.moduleKey}/${item.id}/files`;
		let cancelled = false;
		mediaLoading = true;
		mediaError = false;
		fetch(url)
			.then((r) => r.json())
			.then((d) => {
				if (cancelled) return;
				media = d.items ?? [];
				mediaCapped = d.capped ?? false;
			})
			.catch(() => !cancelled && (mediaError = true))
			.finally(() => !cancelled && (mediaLoading = false));
		return () => {
			cancelled = true;
		};
	});

	const onDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(`Delete this ${mod.singular}?`)) {
			cancel();
			return;
		}
		return async ({ result }) => {
			if (result.type === 'redirect') {
				toast.success(`${capitalize(mod.singular)} deleted`);
				await goto(result.location, { invalidateAll: true });
			} else if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Delete failed'));
			}
		};
	};

	const onOpen: SubmitFunction = () => async ({ result }) => {
		if (result.type === 'success') toast.success('Opening in your file manager…');
		else if (result.type === 'failure') toast.error(String(result.data?.message ?? 'Could not open'));
		else toast.error('Could not open the folder.');
	};
</script>

<svelte:head><title>base — {title}</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<div class="flex flex-col gap-4">
		<a
			href={`/${mod.key}`}
			class="flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-3.5" />
			{mod.label}
		</a>
		<PageHeader code={`${code} · ${item.id}`} {title} subtitle={metaLine}>
			{#snippet actions()}
				<div class="flex items-center gap-2.5">
					{#if mod.statusField}
						<StatusDot {mod} value={item[mod.statusField]} showLabel size={8} />
					{/if}
					{#if folderPath}
						<form method="POST" action="?/open" use:enhance={onOpen}>
							<Button type="submit" variant="outline" size="sm">
								<FolderOpen class="size-4" /> Open folder
							</Button>
						</form>
					{/if}
				</div>
			{/snippet}
		</PageHeader>
		{#if folderPath}
			<div
				class="-mt-2 flex flex-col gap-1 rounded-[12px] border bg-card px-5 py-4 font-mono text-[11px] text-muted-foreground"
			>
				<div class="flex gap-2">
					<span class="w-14 shrink-0 uppercase tracking-wide text-muted-foreground/60">path</span>
					<span class="break-all text-foreground/80">{folderPath}</span>
				</div>
				{#if archive}
				<div class="flex gap-2">
					<span class="w-14 shrink-0 uppercase tracking-wide text-muted-foreground/60">size</span>
					<span>
						{archive.size_human} · {archive.file_count} files{archive.subdir_count
							? ` · ${archive.subdir_count} folders`
							: ''}
					</span>
				</div>
				{/if}
				{#if archive?.top_extensions}
					<div class="flex gap-2">
						<span class="w-14 shrink-0 uppercase tracking-wide text-muted-foreground/60">types</span>
						<span>
							{Object.entries(archive.top_extensions as Record<string, number>)
								.map(([k, v]) => `${k}·${v}`)
								.join('   ')}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="mt-8 flex flex-col gap-8">
	{#if folderPath}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<section
			class="flex flex-col gap-3 rounded-[12px] {dragOverFiles
				? 'outline-dashed outline-2 outline-signal/60'
				: ''}"
			ondragover={(e) => {
				e.preventDefault();
				dragOverFiles = true;
			}}
			ondragleave={() => (dragOverFiles = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragOverFiles = false;
				uploadRecordFiles(e.dataTransfer?.files);
			}}
		>
			<input
				type="file"
				multiple
				hidden
				bind:this={recordFileInput}
				onchange={(e) => {
					const input = e.currentTarget as HTMLInputElement;
					uploadRecordFiles(input.files);
					input.value = '';
				}}
			/>
			<div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
				<span>Files</span>
				{#if media.length}<span>· {media.length}{mediaCapped ? '+' : ''}</span>{/if}
				<button
					type="button"
					onclick={() => recordFileInput?.click()}
					disabled={uploadBusy}
					title="Add files to this record's folder (or drop them on this section)"
					class="ml-2 cursor-pointer rounded-[6px] border px-2 py-1 text-[10px] normal-case tracking-normal text-muted-foreground hover:border-ring/40 hover:text-foreground/80 disabled:opacity-50"
				>
					{uploadBusy ? 'Adding…' : '+ Add files'}
				</button>
			</div>
			{#if mediaLoading}
				<p class="font-mono text-xs text-muted-foreground">Scanning folder…</p>
			{:else if mediaError}
				<p class="font-mono text-xs text-destructive">Couldn't read the folder — is the drive mounted?</p>
			{:else if !media.length}
				<p class="font-mono text-xs text-muted-foreground">
					No previewable media yet — drop files here or use “+ Add files”.
				</p>
			{:else}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each media as m (m.rel)}
						{#if m.kind === 'image'}
							<button
								type="button"
								title={m.name}
								onclick={() => openLightbox(m.rel)}
								class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
							>
								<img
									src={`${base}/thumb?p=${enc(m.rel)}&w=400`}
									alt={m.name}
									loading="lazy"
									class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
								/>
								{#if m.seq}
									<span
										class="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white"
									>
										{m.count} frames
									</span>
								{/if}
							</button>
						{:else if m.kind === 'video'}
							<div class="col-span-2 flex flex-col gap-1">
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									controls
									preload="metadata"
									poster={`${base}/thumb?p=${enc(m.rel)}&w=800`}
									class="aspect-video w-full rounded-lg border bg-black"
									src={`${base}/file?p=${enc(m.rel)}`}
								></video>
								<span class="truncate font-mono text-[10px] text-muted-foreground">{m.name}</span>
							</div>
						{:else if m.kind === 'audio'}
							<div class="col-span-2 flex flex-col justify-center gap-2 rounded-lg border bg-card p-3 sm:col-span-3">
								<span class="truncate font-mono text-[11px]">{m.name}</span>
								<audio controls preload="none" class="w-full" src={`${base}/file?p=${enc(m.rel)}`}></audio>
							</div>
						{/if}
					{/each}
				</div>
				{#if mediaCapped}
					<p class="font-mono text-[11px] text-muted-foreground">
						Showing the first {media.length}. Open the folder to see everything.
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	{#if photoUrl || productLinks.length}
		<div class="flex max-w-5xl items-center gap-5 rounded-[12px] border bg-card px-6 py-4">
			{#if photoUrl}
				<img
					src={photoUrl}
					alt={title}
					class="max-h-40 max-w-[220px] rounded-lg border bg-background object-contain"
				/>
			{/if}
			{#if productLinks.length}
				<div class="flex flex-wrap gap-2">
					{#each productLinks as [label, url] (label)}
						<a
							href={url}
							target="_blank"
							rel="noreferrer"
							class="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground/80 transition-colors hover:border-ring/40 hover:text-signal"
						>
							{label} ↗
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Click delegation catches edits that only move hidden inputs (tag
	     chips, calendar picks); the snapshot diff makes no-op checks free. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<form
		id="record-form"
		method="POST"
		action="?/update"
		class="flex flex-col gap-8"
		oninput={() => scheduleSave()}
		onchange={() => {
			syncKind();
			scheduleSave();
		}}
		onclick={() => scheduleSave()}
		onsubmit={(e) => {
			e.preventDefault();
			flushNow();
		}}
	>
	{#if mod.docField}
		<input type="hidden" name={mod.docField} value={bodyText} />
	{/if}

	{#if stripFields.length}
		<section class="flex max-w-5xl flex-col gap-3 rounded-[12px] border bg-card px-6 py-4">
			{#key item.id}
				<ModuleFields
					fields={stripFields}
					{item}
					relationOptions={data.relationOptions}
					layout="row"
				/>
			{/key}
		</section>
	{/if}

	<!-- What came out of this note: pages written inside it. -->
	{#if data.children?.length}
		<section class="max-w-5xl overflow-hidden rounded-[12px] border bg-card">
			<div class="flex items-center justify-between border-b px-6 py-3">
				<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Pages in this note
				</span>
				<span class="font-mono text-[11px] tabular-nums text-muted-foreground">
					{data.children.length}
				</span>
			</div>
			<div class="divide-y">
				{#each data.children as c (c.id)}
					<a
						href={`/notes/${c.id}`}
						class="flex items-center justify-between gap-3 px-6 py-2.5 transition-colors hover:bg-accent"
					>
						<span class="min-w-0 truncate text-sm">{c.title}</span>
						<span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
							{c.chars >= 1000 ? `${Math.round(c.chars / 1000)}k` : c.chars} chars
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if mod.docField}
		<section class="flex max-w-5xl flex-col gap-3 rounded-[12px] border bg-card px-6 py-5">
			{#key item.id}
				<MarkdownField bind:value={bodyText} onchange={() => scheduleSave()} onsave={saveDoc}>
					{#snippet header()}
						<div class="flex items-center gap-3">
							<div class="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
								DOCUMENT
							</div>
							<div class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
								<span
									class={cn(
										'size-1.5 rounded-full',
										saveState === 'saved' && 'bg-[#2f7d5b]',
										saveState === 'error' && 'bg-destructive',
										(saveState === 'pending' || saveState === 'saving') &&
											'animate-pulse bg-signal'
									)}
								></span>
								{saveLabel[saveState]}
							</div>
						</div>
					{/snippet}
				</MarkdownField>
			{/key}
			<div class="font-mono text-[10px] text-muted-foreground">
				Type '/' for blocks · markdown shortcuts as you type · saves automatically
			</div>
		</section>
	{/if}

	<section class="flex max-w-5xl flex-col gap-4 rounded-[12px] border bg-card px-6 py-5">
		<div class="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">DETAILS</div>
		{#key item.id}
			<ModuleFields
				fields={mod.fields}
				{item}
				relationOptions={data.relationOptions}
				tagSuggestions={data.tagSuggestions}
				suggestionsByField={data.attendeeSuggestions ? { attendees: data.attendeeSuggestions } : {}}
				exclude={detailExclude}
			/>
		{/key}
	</section>
	</form>

	<div class="flex max-w-5xl items-center justify-between gap-2 border-t pt-4">
		<form method="POST" action="?/delete" use:enhance={onDelete}>
			<Button type="submit" variant="destructive" size="sm">
				<Trash2 class="size-4" /> Delete
			</Button>
		</form>
		<div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			<span
				class={cn(
					'size-1.5 rounded-full',
					saveState === 'saved' && 'bg-[#2f7d5b]',
					saveState === 'error' && 'bg-destructive',
					(saveState === 'pending' || saveState === 'saving') && 'animate-pulse bg-signal'
				)}
			></span>
			{saveLabel[saveState]}
		</div>
	</div>
	</div>
</div>

<svelte:window onkeydown={onKey} onpagehide={() => flushNow(true)} />
<svelte:document onvisibilitychange={onLifecycleHide} />

{#if lightbox !== null && images[lightbox]}
	{@const cur = images[lightbox]}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex flex-col bg-black/90"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={closeLightbox}
	>
		<div class="flex items-center justify-between gap-3 p-3 font-mono text-[11px] text-white/70">
			<span class="min-w-0 truncate">{cur.name}</span>
			<span class="shrink-0 tabular-nums">{lightbox + 1} / {images.length}</span>
			<button
				type="button"
				class="shrink-0 rounded px-2 py-1 transition-colors hover:bg-white/10"
				onclick={(e) => {
					e.stopPropagation();
					closeLightbox();
				}}
			>
				Close ✕
			</button>
		</div>
		<div class="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6 sm:px-14">
			<img
				src={`${base}/file?p=${enc(cur.rel)}`}
				alt={cur.name}
				class="max-h-full max-w-full object-contain"
			/>
		</div>
		{#if images.length > 1}
			<button
				type="button"
				aria-label="Previous"
				class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
				onclick={(e) => {
					e.stopPropagation();
					step(-1);
				}}
			>
				<ChevronLeft class="size-6" />
			</button>
			<button
				type="button"
				aria-label="Next"
				class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
				onclick={(e) => {
					e.stopPropagation();
					step(1);
				}}
			>
				<ChevronRight class="size-6" />
			</button>
		{/if}
	</div>
{/if}
