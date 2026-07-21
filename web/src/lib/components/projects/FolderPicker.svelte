<script lang="ts">
	// Browse the machine's folders (via /browse) and link one to the project.
	// Starts at the project's current path when set, otherwise at the roots.
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Folder from '@lucide/svelte/icons/folder';

	let { t }: { t: Tracker } = $props();

	// The picker instance is {#key}ed by pid, so capturing initial values here
	// is intentional — a different project mounts a fresh picker.
	// svelte-ignore state_referenced_locally
	const pid = t.picker!.pid;
	interface Listing {
		path: string;
		parent: string | null;
		dirs: { name: string; path: string }[];
		mediaCount: number;
	}
	let roots = $state<string[] | null>(null);
	let listing = $state<Listing | null>(null);
	let err = $state('');

	async function load(p: string | null) {
		err = '';
		try {
			const res = await fetch(p ? `/browse?p=${encodeURIComponent(p)}` : '/browse');
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.status);
			const data = await res.json();
			if (data.roots) {
				roots = data.roots;
				listing = null;
			} else {
				listing = data;
				roots = null;
			}
		} catch (e) {
			err = String(e);
		}
	}
	// svelte-ignore state_referenced_locally
	load(t.find(pid)?.path || null);

	const rowClass =
		'flex w-full cursor-pointer items-center gap-2.5 border-t px-1 py-2 text-left text-[13.5px] first:border-t-0 hover:bg-accent';
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') t.closePicker();
	}}
/>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
	role="button"
	tabindex="-1"
	onclick={t.closePicker}
	onkeydown={() => {}}
>
	<div
		role="dialog"
		tabindex="-1"
		aria-label="Link a folder"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		class="flex max-h-[80vh] w-[560px] max-w-[92vw] flex-col rounded-[16px] border bg-popover p-[26px_28px_24px] shadow-[0_24px_70px_rgba(0,0,0,.25)]"
	>
		<div class="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
			LINK A FOLDER
		</div>
		<div class="mb-4 break-all font-mono text-[12px] text-foreground/70">
			{listing?.path ?? 'Choose where to start'}
		</div>

		{#if err}
			<div class="mb-3 rounded-[9px] border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
				{err}
			</div>
		{/if}

		<div class="min-h-[200px] flex-1 overflow-y-auto rounded-[10px] border bg-card px-3 py-1.5">
			{#if roots}
				{#each roots as r (r)}
					<button class={rowClass} onclick={() => load(r)}>
						<Folder class="size-4 flex-none text-muted-foreground" />
						<span class="break-all font-mono text-[12.5px]">{r}</span>
					</button>
				{/each}
			{:else if listing}
				{#if listing.parent}
					<button class={rowClass} onclick={() => load(listing!.parent)}>
						<ArrowUp class="size-4 flex-none text-muted-foreground" />
						<span class="font-mono text-[12.5px] text-muted-foreground">..</span>
					</button>
				{/if}
				{#each listing.dirs as d (d.path)}
					<button class={rowClass} onclick={() => load(d.path)}>
						<Folder class="size-4 flex-none text-muted-foreground" />
						<span class="truncate">{d.name}</span>
					</button>
				{:else}
					<div class="px-1 py-3 text-[13px] text-muted-foreground">No subfolders.</div>
				{/each}
			{/if}
		</div>

		<div class="mt-4 flex items-center justify-between gap-3">
			<span class="font-mono text-[11px] text-muted-foreground">
				{#if listing}
					{listing.mediaCount} previewable file{listing.mediaCount === 1 ? '' : 's'} here
				{/if}
			</span>
			<div class="flex gap-2.5">
				<button
					onclick={t.closePicker}
					class="cursor-pointer rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground/70 hover:border-ring/40"
					>Cancel</button
				>
				<button
					disabled={!listing}
					onclick={() => listing && t.setPath(pid, listing.path)}
					class="cursor-pointer rounded-[9px] bg-primary px-[18px] py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40"
					>Use this folder</button
				>
			</div>
		</div>
	</div>
</div>
