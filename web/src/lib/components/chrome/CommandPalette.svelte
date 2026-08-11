<script lang="ts">
	// ⌘K. Two kinds of destination in one list: places (the rail, matched
	// locally) and records (matched by /lookup, which fans the query across
	// every visible module).
	//
	// Idle it lists places, so it doubles as the rail for anyone who'd rather
	// type than aim. With a query, records come first — if you're typing words
	// you're usually after a thing, not a table.
	import { goto } from '$app/navigation';
	import { navTargets } from '$lib/nav';
	import { relTime } from '$lib/format';
	import Search from '@lucide/svelte/icons/search';
	import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	type Row = { code: string; label: string; href: string; meta: string };

	const PLACES = navTargets();

	let q = $state('');
	let records = $state<Row[]>([]);
	let loading = $state(false);
	let cursor = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLElement | null>(null);

	// Places match on the label or on the patchbay code — `txn` jumps to
	// Transactions, which is the whole reason those codes are worth having.
	const places = $derived.by(() => {
		const term = q.trim().toLowerCase();
		const hits = term
			? PLACES.filter(
					(p) => p.label.toLowerCase().includes(term) || p.code.toLowerCase().startsWith(term)
				)
			: PLACES;
		return hits.map((p) => ({ ...p, meta: p.href }));
	});

	// Records first when searching, places first when idle.
	const sections = $derived(
		q.trim()
			? [
					{ key: 'records', label: 'Records', rows: records },
					{ key: 'places', label: 'Go to', rows: places.slice(0, 5) }
				].filter((s) => s.rows.length)
			: [{ key: 'places', label: 'Go to', rows: places }]
	);

	const flat = $derived(sections.flatMap((s) => s.rows));

	$effect(() => {
		// Keep the cursor inside the list as results change under it.
		if (cursor >= flat.length) cursor = Math.max(0, flat.length - 1);
	});

	$effect(() => {
		if (open) {
			q = '';
			records = [];
			cursor = 0;
			// The input mounts with the overlay, so focus after paint.
			queueMicrotask(() => input?.focus());
		}
	});

	// Debounced, and aborted on the next keystroke so a slow module's response
	// can't land after a newer one and overwrite it.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inflight: AbortController | undefined;

	function search(term: string) {
		clearTimeout(timer);
		inflight?.abort();
		if (!term.trim()) {
			records = [];
			loading = false;
			return;
		}
		loading = true;
		timer = setTimeout(async () => {
			const ctl = new AbortController();
			inflight = ctl;
			try {
				const res = await fetch(`/lookup?q=${encodeURIComponent(term.trim())}`, {
					signal: ctl.signal
				});
				const body = await res.json();
				records = (body.results ?? []).map(
					(r: {
						code: string;
						label: string;
						href: string;
						updatedAt: string | null;
						reason?: string;
					}) => ({
						code: r.code,
						label: r.label,
						href: r.href,
						// A row that's here because of something else says so —
						// otherwise a project appearing under a document search reads
						// as a bug rather than an offer.
						meta: r.reason ?? relTime(r.updatedAt)
					})
				);
				cursor = 0;
			} catch (err) {
				if ((err as Error)?.name !== 'AbortError') records = [];
			} finally {
				if (inflight === ctl) loading = false;
			}
		}, 160);
	}

	function onInput(e: Event) {
		q = (e.currentTarget as HTMLInputElement).value;
		search(q);
	}

	function choose(row: Row | undefined, newTab = false) {
		if (!row) return;
		open = false;
		if (newTab) window.open(row.href, '_blank');
		else goto(row.href);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = flat.length ? (cursor + 1) % flat.length : 0;
			scrollToCursor();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = flat.length ? (cursor - 1 + flat.length) % flat.length : 0;
			scrollToCursor();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(flat[cursor], e.metaKey || e.ctrlKey);
		}
	}

	function scrollToCursor() {
		queueMicrotask(() =>
			listEl?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
		);
	}

	// Index within the flattened list, so arrow keys cross section boundaries.
	function indexOf(sectionKey: string, i: number) {
		let n = 0;
		for (const s of sections) {
			if (s.key === sectionKey) return n + i;
			n += s.rows.length;
		}
		return n + i;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[14vh] backdrop-blur-[1px]"
		onclick={(e) => {
			if (e.target === e.currentTarget) open = false;
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search or jump"
			class="w-full max-w-[520px] overflow-hidden rounded-[12px] border bg-card shadow-2xl"
		>
			<div class="flex items-center gap-2.5 border-b px-4 py-3">
				<Search class="size-4 shrink-0 text-muted-foreground" />
				<!-- svelte-ignore a11y_autofocus -->
				<input
					bind:this={input}
					value={q}
					oninput={onInput}
					onkeydown={onKeydown}
					placeholder="Search records, or type a code to jump…"
					autocomplete="off"
					spellcheck="false"
					aria-label="Search records or jump to a section"
					class="min-w-0 flex-1 border-none bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
				/>
				{#if loading}
					<span class="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">…</span>
				{/if}
				<kbd class="rounded border px-1.5 py-px font-mono text-[10px] text-muted-foreground">esc</kbd>
			</div>

			<div bind:this={listEl} class="max-h-[292px] overflow-y-auto py-1.5">
				{#each sections as section (section.key)}
					<div
						class="px-4 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70"
					>
						{section.label}
					</div>
					{#each section.rows as row, i (row.href)}
						{@const sel = indexOf(section.key, i) === cursor}
						<button
							type="button"
							data-cursor={sel}
							onclick={(e) => choose(row, e.metaKey || e.ctrlKey)}
							onmousemove={() => (cursor = indexOf(section.key, i))}
							class={`flex w-full items-center gap-3 px-4 py-1.5 text-left text-[13.5px] transition-colors ${
								sel ? 'bg-sidebar-accent' : ''
							}`}
						>
							<span
								class={`w-11 shrink-0 font-mono text-[11px] ${sel ? 'text-signal' : 'text-muted-foreground/70'}`}
								>{row.code}</span
							>
							<span class="min-w-0 flex-1 truncate">{row.label}</span>
							<span
								class="max-w-[46%] shrink-0 truncate font-mono text-[10px] text-muted-foreground"
								>{row.meta}</span
							>
						</button>
					{/each}
				{:else}
					<div class="px-4 py-7 text-center text-[13px] text-muted-foreground">
						{loading ? 'Searching…' : `Nothing matches “${q.trim()}”.`}
					</div>
				{/each}
			</div>

			<div
				class="flex gap-4 border-t bg-background px-4 py-2 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground"
			>
				<span>↑↓ move</span>
				<span class="flex items-center gap-1"><CornerDownLeft class="size-3" /> open</span>
				<span>⌘↵ new tab</span>
			</div>
		</div>
	</div>
{/if}
