<script lang="ts">
	// FILES-card row for an audio file: inline play/pause, a real waveform
	// (peaks from /wave, synthetic bars while loading or when decoding fails),
	// progress painted onto the waveform, click-to-seek.
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import { filePreview, fmtDur, type ProjFile } from '$lib/projects/data';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import FileRowActions from './FileRowActions.svelte';

	let { t, pid, file }: { t: Tracker; pid: string; file: ProjFile } = $props();

	// The row is {#key}ed by file.rel, so capturing initial values here is
	// intentional — a different file mounts a fresh row.
	// svelte-ignore state_referenced_locally
	const pv = filePreview(file.name);
	// svelte-ignore state_referenced_locally
	const src = `/projects/${pid}/file?p=${encodeURIComponent(file.rel!)}`;

	let peaks = $state<number[] | null>(null);
	let duration = $state(0);
	let synthetic = $state(false);

	// svelte-ignore state_referenced_locally
	fetch(`/projects/${pid}/wave?p=${encodeURIComponent(file.rel!)}`)
		.then(async (res) => {
			if (!res.ok) throw new Error();
			const w = (await res.json()) as { peaks: number[]; duration: number };
			peaks = w.peaks;
			duration = w.duration;
		})
		.catch(() => {
			synthetic = true;
			peaks = Array.from({ length: 32 }, (_, i) => pv.bars[i % pv.bars.length] / 100);
		});

	let audio = $state<HTMLAudioElement | null>(null);
	let playing = $state(false);
	let progress = $state(0); // 0..1

	function toggle() {
		if (!audio) return;
		if (playing) audio.pause();
		else void audio.play();
	}
	function seek(e: MouseEvent) {
		if (!audio || synthetic || !audio.duration) return;
		const el = e.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect();
		audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
	}
</script>

<audio
	bind:this={audio}
	{src}
	preload="none"
	onplay={() => (playing = true)}
	onpause={() => (playing = false)}
	onended={() => {
		playing = false;
		progress = 0;
	}}
	ontimeupdate={() => (progress = audio?.duration ? audio.currentTime / audio.duration : 0)}
></audio>

<div class="group flex items-center gap-3 border-t py-2.5 first:border-t-0">
	<button
		onclick={toggle}
		title={playing ? 'Pause' : 'Play'}
		class="grid size-10 flex-none cursor-pointer place-items-center rounded-[8px] text-white hover:opacity-90"
		style="background:{pv.color};"
	>
		{#if playing}<Pause class="size-4 fill-current" />{:else}<Play class="size-4 fill-current" />{/if}
	</button>
	<div class="min-w-0 flex-1">
		<div class="flex items-baseline justify-between gap-2">
			<span class="truncate text-[13.5px]">{file.name}</span>
			<span class="flex-none font-mono text-[10px] text-muted-foreground"
				>{pv.ext}{duration ? ` · ${fmtDur(Math.round(duration))}` : ''}</span
			>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="mt-1 flex h-[26px] items-end gap-px {synthetic ? '' : 'cursor-pointer'}"
			onclick={seek}
			title={synthetic ? undefined : 'Seek'}
		>
			{#each peaks ?? [] as pk, i (i)}
				{@const played = peaks && i / peaks.length < progress}
				<span
					class="min-w-0 flex-1 rounded-[1px]"
					style="height:{Math.max(8, pk * 100)}%;background:{played
						? pv.color
						: 'var(--muted-foreground)'};opacity:{played ? 1 : 0.35};"
				></span>
			{/each}
		</div>
	</div>
	<FileRowActions {t} {pid} {file} />
</div>
