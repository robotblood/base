<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { page, updated } from '$app/state';
	import { MODULES, MODULE_CODES } from '$lib/modules';
	import { Toaster } from '$lib/components/ui/sonner';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import type { LayoutData } from './$types';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

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

	type NavItem = {
		code: string;
		label: string;
		href: string;
		count: number | null;
		rule?: boolean; // draw a separator above this item
	};

	const nav = $derived.by(() => {
		const items: NavItem[] = [{ code: '~', label: 'Overview', href: '/', count: null }];
		for (const m of MODULES) {
			// Hidden modules (imported data not modelled yet) are reachable by URL
			// and listed under /admin, but don't take a slot in the sidebar.
			if (m.hidden) continue;
			// The aggregated calendar and the shows pipeline sit where the events
			// table lives — they're views over it (plus the other dated tables).
			if (m.key === 'events') {
				items.push({ code: 'CAL', label: 'Calendar', href: '/calendar', count: null });
				items.push({ code: 'SHOW', label: 'Shows', href: '/shows', count: null });
			}
			items.push({
				code: MODULE_CODES[m.key] ?? '',
				label: m.label,
				href: `/${m.key}`,
				count: stats[m.key] ?? 0
			});
		}
		// Admin sits below the data, ruled off — it operates the system rather
		// than being part of it.
		items.push({ code: 'SYS', label: 'Admin', href: '/admin', count: null, rule: true });
		return items;
	});

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
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

		<nav class="flex flex-1 flex-col gap-px overflow-y-auto py-2 pr-2">
			{#each nav as item (item.href)}
				{@const active = isActive(item.href)}
				{#if item.rule}
					<div class="my-1.5 ml-3 mr-2 h-px bg-sidebar-border"></div>
				{/if}
				<a
					href={item.href}
					class={`group flex items-center gap-3 border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors ${
						active
							? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
							: 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
					}`}
				>
					<span
						class={`w-11 shrink-0 font-mono text-[11px] tracking-wide ${active ? 'text-signal' : 'text-muted-foreground/70'}`}
					>
						{item.code}
					</span>
					<span class="flex-1 truncate">{item.label}</span>
					{#if item.count != null}
						<span class="font-mono text-[11px] tabular-nums text-muted-foreground/80">{item.count}</span>
					{/if}
				</a>
				{#if item.href === '/'}
					<div class="my-1.5 ml-3 mr-2 h-px bg-sidebar-border"></div>
				{/if}
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

<ModeWatcher />
<Toaster richColors closeButton />
