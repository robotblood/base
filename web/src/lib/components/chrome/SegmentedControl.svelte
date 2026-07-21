<script lang="ts" generics="T extends string">
	// Filled segmented control — the app's view switcher. Icons are optional so
	// the same component serves the tracker's text-only Board/List/Timeline and
	// the module pages' icon+label variants.
	import type { Component } from 'svelte';

	let {
		items,
		value,
		onchange,
		hideLabelsBelowSm = false
	}: {
		items: { value: T; label: string; icon?: Component }[];
		value: T;
		onchange: (v: T) => void;
		hideLabelsBelowSm?: boolean; // icon-only on narrow screens
	} = $props();
</script>

<div class="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
	{#each items as item (item.value)}
		{@const Icon = item.icon}
		<button
			type="button"
			onclick={() => onchange(item.value)}
			aria-pressed={value === item.value}
			title={item.label}
			class="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[12px] font-semibold transition-colors
			{value === item.value
				? 'bg-primary text-primary-foreground'
				: 'text-foreground/70 hover:text-foreground'}"
		>
			{#if Icon}<Icon class="size-3.5" />{/if}
			<span class={hideLabelsBelowSm ? 'hidden sm:inline' : ''}>{item.label}</span>
		</button>
	{/each}
</div>
