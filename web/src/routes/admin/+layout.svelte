<script lang="ts">
	// Admin shell: one sub-nav across every admin page. Sections come from
	// $lib/admin so a new page is a one-line registration.
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ADMIN_SECTIONS } from '$lib/admin';

	let { children }: { children: Snippet } = $props();
</script>

<div class="border-b bg-sidebar/40">
	<div class="flex items-center gap-1 px-9 pt-5">
		{#each ADMIN_SECTIONS as s (s.key)}
			{@const active = page.url.pathname.startsWith(s.href)}
			<a
				href={s.href}
				title={s.blurb}
				class={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
					active
						? 'border-signal text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				}`}
			>
				{s.label}
			</a>
		{/each}
	</div>
</div>

{@render children()}
