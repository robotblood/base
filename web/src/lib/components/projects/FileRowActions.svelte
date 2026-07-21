<script lang="ts">
	// Hover actions for a real on-disk file row: open, reveal, rename, move.
	// Rename swaps in an inline input; move swaps in a folder select. Used by
	// both the standard FILES rows and the audio player rows.
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import type { ProjFile } from '$lib/projects/data';

	let { t, pid, file }: { t: Tracker; pid: string; file: ProjFile } = $props();

	let mode = $state<'idle' | 'rename' | 'move'>('idle');
	let value = $state('');
	let dirs = $state<string[]>([]);

	const curDir = () => (file.rel!.includes('/') ? file.rel!.slice(0, file.rel!.lastIndexOf('/')) : '');

	function startRename() {
		mode = 'rename';
		value = file.name;
	}
	async function startMove() {
		mode = 'move';
		value = curDir();
		dirs = await t.fileDirs(pid);
	}
	function commit() {
		if (mode === 'rename' && value.trim() && value.trim() !== file.name)
			void t.renameFile(pid, file.rel!, value.trim());
		else if (mode === 'move' && value !== curDir()) void t.moveFile(pid, file.rel!, value);
		mode = 'idle';
	}

	const btn =
		'cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80';
</script>

{#if mode === 'rename'}
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:value
		autofocus
		onblur={commit}
		onkeydown={(e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') mode = 'idle';
		}}
		aria-label="New file name"
		class="w-[200px] flex-none rounded-[7px] border bg-card px-2 py-1 font-mono text-[11px] outline-none focus:border-ring"
	/>
{:else if mode === 'move'}
	<div class="flex flex-none items-center gap-1">
		<select
			bind:value
			aria-label="Move to folder"
			class="max-w-[180px] rounded-[7px] border bg-card px-1.5 py-1 font-mono text-[10px] outline-none focus:border-ring"
		>
			<option value="">/ (project root)</option>
			{#each dirs as d (d)}
				<option value={d}>/{d}</option>
			{/each}
		</select>
		<button onclick={commit} class={btn}>GO</button>
		<button onclick={() => (mode = 'idle')} class={btn}>✕</button>
	</div>
{:else}
	<div class="hidden flex-none gap-1 group-hover:flex">
		<button onclick={() => t.openLocal(pid, file.rel)} title="Open in native app" class={btn}
			>OPEN</button
		>
		<button
			onclick={() => t.openLocal(pid, file.rel, 'reveal')}
			title="Reveal in file manager"
			class={btn}>REVEAL</button
		>
		<button onclick={startRename} title="Rename file" class={btn}>RENAME</button>
		<button onclick={startMove} title="Move to another folder" class={btn}>MOVE</button>
	</div>
{/if}
