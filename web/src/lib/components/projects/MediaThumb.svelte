<script lang="ts">
	// Real thumbnail for an on-disk file (image or video poster), falling back
	// to the synthetic swatch when no preview exists — e.g. video posters
	// before ffmpeg is installed, or unsupported formats.
	import { filePreview, type ProjFile } from '$lib/projects/data';
	import FileThumb from './FileThumb.svelte';

	let { pid, file, size = 40 }: { pid: string; file: ProjFile; size?: number } = $props();

	let failed = $state(false);
	const real = $derived(
		!failed && file.rel && (file.kind === 'image' || file.kind === 'video')
	);
</script>

{#if real}
	<img
		src="/projects/{pid}/thumb?p={encodeURIComponent(file.rel!)}&w={size * 2}"
		alt={file.name}
		loading="lazy"
		onerror={() => (failed = true)}
		class="flex-none rounded-[8px] border object-cover"
		style="width:{size}px;height:{size}px;"
	/>
{:else}
	<FileThumb preview={filePreview(file.name)} {size} />
{/if}
