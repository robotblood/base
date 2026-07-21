<script lang="ts">
	// A semantic state dot, optionally with its label. Renders nothing when the
	// module has no colour for the value, so uncoloured vocabularies degrade to
	// plain text rather than a meaningless grey circle.
	import type { ModuleConfig } from '$lib/types';
	import { statusColor } from '$lib/status';

	let {
		mod,
		value,
		showLabel = false,
		size = 7
	}: {
		mod: ModuleConfig;
		value: unknown;
		showLabel?: boolean;
		size?: number;
	} = $props();

	const color = $derived(statusColor(mod, value));
	const text = $derived(value == null ? '' : String(value));
</script>

{#if color}
	<span class="inline-flex items-center gap-1.5 text-[12px] text-foreground/70">
		<span
			class="shrink-0 rounded-full"
			style="background:{color};width:{size}px;height:{size}px;"
		></span>
		{#if showLabel}{text}{/if}
	</span>
{:else if showLabel && text}
	<span class="text-[12px] text-foreground/70">{text}</span>
{/if}
