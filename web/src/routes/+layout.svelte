<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { MODULES, MODULE_CODES } from '$lib/modules';
	import { Toaster } from '$lib/components/ui/sonner';
	import { Button } from '$lib/components/ui/button';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import type { LayoutData } from './$types';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const stats = $derived(data.stats ?? {});
	const total = $derived(Object.values(stats).reduce((a, b) => a + b, 0));

	const nav = $derived([
		{ code: '~', label: 'Overview', href: '/', count: null as number | null },
		...MODULES.map((m) => ({
			code: MODULE_CODES[m.key] ?? '',
			label: m.label,
			href: `/${m.key}`,
			count: stats[m.key] ?? 0
		}))
	]);

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

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
