<script lang="ts">
	import type { FilePreview } from '$lib/projects/data';

	let { preview, size = 40 }: { preview: FilePreview; size?: number } = $props();

	const radius = $derived(size >= 40 ? 7 : 6);
	const barW = $derived(size >= 40 ? 2.5 : 2);
	const pad = $derived(size >= 40 ? 5 : 4);
</script>

<div style="width:{size}px;height:{size}px;border-radius:{radius}px;overflow:hidden;flex:0 0 auto;">
	{#if preview.kind === 'audio'}
		<div
			style="width:100%;height:100%;background:#eef1f5;border:1px solid #dfe4ea;border-radius:{radius}px;display:flex;align-items:center;justify-content:center;gap:{barW * 0.6}px;padding:0 {pad}px;"
		>
			{#each preview.bars as b, i (i)}
				<div style="width:{barW}px;border-radius:2px;background:{preview.color};height:{b}%;"></div>
			{/each}
		</div>
	{:else if preview.kind === 'video'}
		<div
			style="width:100%;height:100%;background:linear-gradient(135deg,#2b2b2b,#525252);border-radius:{radius}px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:{size >= 40 ? 12 : 11}px;"
		>
			▶
		</div>
	{:else if preview.kind === 'doc'}
		<div
			style="width:100%;height:100%;background:#f4f1ea;border:1px solid #e5e0d4;border-radius:{radius}px;display:flex;flex-direction:column;justify-content:center;gap:{size >= 40 ? 3 : 2.5}px;padding:0 {size >= 40 ? 8 : 6}px;"
		>
			<div style="height:2px;background:#c9c3b4;border-radius:2px;"></div>
			<div style="height:2px;background:#c9c3b4;border-radius:2px;width:70%;"></div>
			<div style="height:2px;background:#c9c3b4;border-radius:2px;"></div>
		</div>
	{:else if preview.kind === 'image'}
		<div
			style="width:100%;height:100%;background:linear-gradient(135deg,#2f7d5b,#9ec97f);border-radius:{radius}px;"
		></div>
	{:else}
		<div
			style="width:100%;height:100%;background:linear-gradient(135deg,#b23a26,#e0a52e);border-radius:{radius}px;"
		></div>
	{/if}
</div>
