<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import MarkdownDoc from '$lib/components/MarkdownDoc.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
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

	// Markdown document (modules with a docField, i.e. notes): rendered by
	// default, with a Write tab. bodyText backs both tabs and rides into the
	// record form via a hidden input.
	let bodyText = $state('');
	let docTab = $state<'preview' | 'write'>('preview');
	// ?edit=1 (quick-create) opens Write, but only on arrival — after a save
	// the document flips to its formatted view.
	let honorEditParam = true;
	$effect(() => {
		if (!mod.docField) return;
		const v = String(item[mod.docField] ?? '');
		bodyText = v;
		docTab = v && !(honorEditParam && page.url.searchParams.get('edit') === '1') ? 'preview' : 'write';
		honorEditParam = false;
	});

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

	$effect(() => {
		if (!archive) {
			media = [];
			return;
		}
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

	let saving = $state(false);

	const onSave: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				await update({ reset: false });
				toast.success('Saved');
			} else if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Save failed'));
			} else if (result.type === 'error') {
				toast.error('Request failed');
			} else {
				await update();
			}
		};
	};

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
					{#if archive}
						<form method="POST" action="?/open" use:enhance={onOpen}>
							<Button type="submit" variant="outline" size="sm">
								<FolderOpen class="size-4" /> Open folder
							</Button>
						</form>
					{/if}
				</div>
			{/snippet}
		</PageHeader>
		{#if archive}
			<div
				class="-mt-2 flex flex-col gap-1 rounded-[12px] border bg-card px-5 py-4 font-mono text-[11px] text-muted-foreground"
			>
				<div class="flex gap-2">
					<span class="w-14 shrink-0 uppercase tracking-wide text-muted-foreground/60">path</span>
					<span class="break-all text-foreground/80">{archive.path}</span>
				</div>
				<div class="flex gap-2">
					<span class="w-14 shrink-0 uppercase tracking-wide text-muted-foreground/60">size</span>
					<span>
						{archive.size_human} · {archive.file_count} files{archive.subdir_count
							? ` · ${archive.subdir_count} folders`
							: ''}
					</span>
				</div>
				{#if archive.top_extensions}
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
	{#if archive}
		<section class="flex flex-col gap-3">
			<div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
				<span>Files</span>
				{#if media.length}<span>· {media.length}{mediaCapped ? '+' : ''}</span>{/if}
			</div>
			{#if mediaLoading}
				<p class="font-mono text-xs text-muted-foreground">Scanning folder…</p>
			{:else if mediaError}
				<p class="font-mono text-xs text-destructive">Couldn't read the folder — is the drive mounted?</p>
			{:else if !media.length}
				<p class="font-mono text-xs text-muted-foreground">No previewable images, video, or audio in this folder.</p>
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

	{#if mod.docField}
		<section class="flex max-w-2xl flex-col gap-3 rounded-[12px] border bg-card px-6 py-5">
			<div class="flex items-center justify-between">
				<div class="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">DOCUMENT</div>
				<div class="inline-flex gap-0.5 rounded-[8px] bg-muted p-[3px]">
					<button
						type="button"
						onclick={() => (docTab = 'preview')}
						class="cursor-pointer rounded-[6px] px-3 py-1 text-[11px] font-semibold {docTab === 'preview'
							? 'bg-primary text-primary-foreground'
							: 'text-foreground/70'}">Preview</button
					>
					<button
						type="button"
						onclick={() => (docTab = 'write')}
						class="cursor-pointer rounded-[6px] px-3 py-1 text-[11px] font-semibold {docTab === 'write'
							? 'bg-primary text-primary-foreground'
							: 'text-foreground/70'}">Write</button
					>
				</div>
			</div>
			{#if docTab === 'write'}
				<!-- svelte-ignore a11y_autofocus -->
				<textarea
					bind:value={bodyText}
					autofocus
					onkeydown={(e) => {
						if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
							e.preventDefault();
							(document.getElementById('record-form') as HTMLFormElement | null)?.requestSubmit();
						}
					}}
					rows={Math.min(28, Math.max(10, bodyText.split('\n').length + 3))}
					placeholder={'# Heading\n\nWrite markdown — headings, lists, - [ ] checkboxes, **bold**…\nSave to see it formatted.'}
					class="w-full resize-y rounded-[9px] border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.6] outline-none focus:border-ring"
				></textarea>
				<div class="font-mono text-[10px] text-muted-foreground">
					Markdown — Save formats it. Cmd/Ctrl+Enter saves.
				</div>
			{:else if bodyText.trim()}
				<MarkdownDoc source={bodyText} />
			{:else}
				<button
					type="button"
					onclick={() => (docTab = 'write')}
					class="cursor-pointer pt-1 text-left text-[13px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground/80"
					>Empty — start writing.</button
				>
			{/if}
		</section>
	{/if}

	<section class="flex max-w-2xl flex-col gap-4 rounded-[12px] border bg-card px-6 py-5">
		<div class="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">DETAILS</div>
		<form id="record-form" method="POST" action="?/update" use:enhance={onSave}>
			{#if mod.docField}
				<input type="hidden" name={mod.docField} value={bodyText} />
			{/if}
			{#key item.id}
				<ModuleFields
					fields={mod.fields}
					{item}
					relationOptions={data.relationOptions}
					tagSuggestions={data.tagSuggestions}
					exclude={mod.docField ? [mod.docField] : []}
				/>
			{/key}
		</form>
		<div class="flex items-center justify-between gap-2 border-t pt-4">
			<form method="POST" action="?/delete" use:enhance={onDelete}>
				<Button type="submit" variant="destructive" size="sm">
					<Trash2 class="size-4" /> Delete
				</Button>
			</form>
			<div class="flex gap-2">
				<Button href={`/${mod.key}`} variant="outline">Cancel</Button>
				<Button type="submit" form="record-form" disabled={saving}>
					{saving ? 'Saving…' : 'Save changes'}
				</Button>
			</div>
		</div>
	</section>
	</div>
</div>

<svelte:window onkeydown={onKey} />

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
