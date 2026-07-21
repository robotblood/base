<script lang="ts">
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import { KINDS, kindInfo } from '$lib/projects/kinds';

	let { t }: { t: Tracker } = $props();

	const preset = $derived(kindInfo(t.np.kind));
	const inputClass =
		'w-full rounded-[9px] border bg-card px-3 py-[11px] text-[14px] text-foreground outline-none focus:border-ring';
	const fieldLabel = 'mb-2 font-mono text-[10px] tracking-[0.08em] text-muted-foreground';
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') t.closeNew();
	}}
/>

<!-- Overlay -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
	role="button"
	tabindex="-1"
	onclick={t.closeNew}
	onkeydown={() => {}}
>
	<!-- Dialog -->
	<div
		role="dialog"
		tabindex="-1"
		aria-label="New project"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		class="w-[448px] max-w-[92vw] rounded-[16px] border bg-popover p-[26px_28px_24px] shadow-[0_24px_70px_rgba(0,0,0,.25)]"
	>
		<div class="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">NEW PROJECT</div>
		<div class="mb-[22px] text-[21px] font-extrabold tracking-[-0.01em]">Start something</div>

		<div class={fieldLabel}>NAME</div>
		<input
			bind:value={t.np.name}
			placeholder="e.g. Robotblood — Fall Tour"
			class="{inputClass} mb-[18px]"
		/>

		<div class="mb-[18px] flex gap-3.5">
			<div class="flex-1">
				<div class={fieldLabel}>TYPE</div>
				<select bind:value={t.np.kind} class={inputClass}>
					{#each KINDS as k (k.key)}
						<option value={k.key}>{k.label}</option>
					{/each}
				</select>
			</div>
			<div class="flex-1">
				<div class={fieldLabel}>DUE DATE</div>
				<input type="date" bind:value={t.np.due} class={inputClass} />
			</div>
		</div>

		<div class="mb-[22px] text-[12px] leading-[1.6] text-muted-foreground">
			Born with its phases in place:
			<span class="font-mono text-[11px] text-foreground/70">{preset.phases.join(' → ')}</span>
		</div>

		<div class="flex justify-end gap-2.5">
			<button
				onclick={t.closeNew}
				class="cursor-pointer rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground/70 hover:border-ring/40"
				>Cancel</button
			>
			<button
				onclick={() => t.createProject()}
				class="cursor-pointer rounded-[9px] bg-primary px-[18px] py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
				>Create project</button
			>
		</div>
	</div>
</div>
