<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { page, updated } from '$app/state';
	import { MODULES } from '$lib/modules';
	import { buildNav } from '$lib/nav';
	import { Toaster } from '$lib/components/ui/sonner';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import CommandPalette from '$lib/components/chrome/CommandPalette.svelte';
	import type { LayoutData } from './$types';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Search from '@lucide/svelte/icons/search';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const stats = $derived(data.stats ?? {});
	// Counts what the sidebar shows. Hidden modules are excluded so the footer
	// total matches the sum of the items above it rather than silently
	// including rows you can't see from here.
	const total = $derived(
		MODULES.filter((m) => !m.hidden).reduce((sum, m) => sum + (stats[m.key] ?? 0), 0)
	);

	// This runs as a long-lived desktop window, so a rebuild leaves it holding
	// the previous client bundle — and since the nav is built from code baked
	// into that bundle, a page added by the rebuild simply isn't there to click.
	// vite.config.ts already polls version.json; this is the part that says so
	// out loud instead of leaving you looking at an app that quietly lost a
	// feature it never knew about.
	let notified = false;
	$effect(() => {
		if (!updated.current || notified) return;
		notified = true;
		toast('A new build of base is ready', {
			description: 'Reload to pick it up — this window is running the previous version.',
			duration: Number.POSITIVE_INFINITY,
			action: { label: 'Reload', onClick: () => location.reload() }
		});
	});

	// The rail's shape lives in $lib/nav — which category each destination sits
	// under, and which destinations are views over a table rather than tables.
	const nav = $derived(buildNav(stats));

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	// A category unfolds while you're inside it — on its own page or down on
	// one of its tables. Everywhere else it holds a single row, which is the
	// whole point of the drill: seven rows at rest, detail only in context.
	function isOpen(entry: { href: string; children?: { href: string }[] }) {
		return isActive(entry.href) || (entry.children ?? []).some((c) => isActive(c.href));
	}

	// ⌘K from anywhere. Held here rather than inside the palette so the rail's
	// own search button opens the same instance.
	let paletteOpen = $state(false);

	function onKeydown(e: KeyboardEvent) {
		if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Saved design tokens, rendered server-side so the first paint is already
	     themed (no flash of the built-in palette). Emitted after Tailwind's own
	     sheet, so these :root / .dark blocks win at equal specificity. The admin
	     design page overrides this live while you're editing. -->
	{@html `<style id="base-theme">${data.themeCss ?? ''}</style>`}
</svelte:head>

<div class="flex min-h-screen bg-background text-foreground">
	<aside
		class="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground"
	>
		<a href="/" class="flex items-center gap-2.5 px-4 py-4">
			<span
				class="grid size-7 place-items-center rounded-[5px] bg-signal font-mono text-sm font-semibold text-signal-foreground"
			>
				b
			</span>
			<span class="flex flex-col leading-none">
				<span class="text-[15px] font-semibold tracking-tight">base</span>
				<span class="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					personal system
				</span>
			</span>
		</a>

		<button
			type="button"
			onclick={() => (paletteOpen = true)}
			class="mx-3 mb-2 flex items-center gap-2 rounded-[7px] border bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-signal/45"
		>
			<Search class="size-3.5" />
			<span class="flex-1 text-left">Search or jump…</span>
			<kbd class="rounded border px-1 py-px font-mono text-[10px] tracking-wide">⌘K</kbd>
		</button>

		<nav class="flex flex-1 flex-col overflow-y-auto py-1 pr-2">
			{#each nav as section (section.key)}
				{#if section.rule}
					<div class="my-1.5 ml-3 mr-2 h-px bg-sidebar-border"></div>
				{/if}
				{#if section.label}
					<div
						class="px-3 pb-1 pt-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70"
					>
						{section.label}
					</div>
				{/if}
				{#each section.entries as item (item.href)}
					{@const open = isOpen(item)}
					{@const active =
						isActive(item.href) && !(item.children ?? []).some((c) => isActive(c.href))}
					<a
						href={item.href}
						class={`group flex items-center gap-3 border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors ${
							active
								? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
								: 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
						}`}
					>
						<span
							class={`w-11 shrink-0 font-mono text-[11px] tracking-wide ${active || open ? 'text-signal' : 'text-muted-foreground/70'}`}
						>
							{item.code}
						</span>
						<span class="flex-1 truncate">{item.label}</span>
						{#if item.count != null}
							<span
								class={`font-mono text-[11px] tabular-nums ${item.count === 0 ? 'text-muted-foreground/40' : 'text-muted-foreground/80'}`}
								>{item.count}</span
							>
						{/if}
					</a>
					{#if open && item.children?.length}
						<!-- The drill-down: this category's tables, indented, only while
						     you're inside it. Leaving the category folds them away. -->
						{#each item.children as child (child.href)}
							{@const childActive = isActive(child.href)}
							<a
								href={child.href}
								class={`group flex items-center gap-3 border-l-2 py-1 pl-3 pr-2 text-[13px] transition-colors ${
									childActive
										? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
										: 'border-transparent text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
								}`}
							>
								<span
									class={`w-11 shrink-0 pl-3 font-mono text-[10px] tracking-wide ${childActive ? 'text-signal' : 'text-muted-foreground/50'}`}
								>
									{child.code}
								</span>
								<span class="flex-1 truncate">{child.label}</span>
								{#if child.count != null}
									<span
										class={`font-mono text-[10px] tabular-nums ${child.count === 0 ? 'text-muted-foreground/40' : 'text-muted-foreground/70'}`}
										>{child.count}</span
									>
								{/if}
							</a>
						{/each}
					{/if}
				{/each}
			{/each}
		</nav>

		<div class="flex items-center justify-between gap-2 border-t px-3 py-2.5">
			<span class="font-mono text-[11px] tabular-nums text-muted-foreground">{total} items</span>
			<Button onclick={toggleMode} variant="ghost" size="icon-sm" title="Toggle theme">
				<Sun class="size-4 dark:hidden" />
				<Moon class="hidden size-4 dark:block" />
				<span class="sr-only">Toggle theme</span>
			</Button>
		</div>
	</aside>
	<main class="min-w-0 flex-1">
		{@render children()}
	</main>
</div>

<svelte:window onkeydown={onKeydown} />
<CommandPalette bind:open={paletteOpen} />
<ModeWatcher />
<Toaster richColors closeButton />
