<script lang="ts">
	// Show rundown: sections → songs → performers / files / resources.
	// Everything edits in place and persists through the tracker; song FILES
	// attach real media (audio/video/3d/images) from the project's linked folder.
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import {
		fmtDur,
		parseDur,
		filePreview,
		initials,
		SONG_FILE_MAP,
		RES_ICON,
		type Project,
		type Song
	} from '$lib/projects/data';
	import FileThumb from './FileThumb.svelte';
	import ListMusic from '@lucide/svelte/icons/list-music';
	import X from '@lucide/svelte/icons/x';

	let { t, p }: { t: Tracker; p: Project } = $props();

	const sections = $derived(p.rundown?.sections ?? []);
	const totals = $derived.by(() => {
		let total = 0,
			count = 0;
		for (const sec of sections)
			for (const s of sec.songs) {
				total += s.dur || 0;
				count++;
			}
		return { total, count };
	});
	const secDur = (songs: Song[]) => songs.reduce((a, s) => a + (s.dur || 0), 0);
	const metaLine = (s: Song) =>
		[fmtDur(s.dur || 0), s.key, s.bpm ? s.bpm + ' BPM' : ''].filter(Boolean).join('   ·   ');

	const readyDefs = [
		{ key: 'files', label: 'Files', color: '#3a6ea5' },
		{ key: 'cues', label: 'Cues', color: '#c68a1a' },
		{ key: 'rehearsed', label: 'Rehearsed', color: '#2f7d5b' }
	] as const;

	// Media in the project folder that can be attached to a song.
	const attachable = $derived(p.files.filter((f) => f.rel));
	const ROLES = ['playback', 'click', 'track', 'visuals', 'lighting', 'model', 'chart'];

	// Inline "attach file" state — one open picker at a time.
	let attachFor = $state<string | null>(null);
	let attachRel = $state('');
	let attachRole = $state('playback');
	function doAttach(sid: string) {
		const f = attachable.find((x) => x.rel === attachRel);
		if (!f) return;
		t.attachSongFile(p.id, sid, { type: attachRole, name: f.name, rel: f.rel });
		attachFor = null;
		attachRel = '';
	}
	// Suggest a role from the file's kind when one is picked.
	function suggestRole() {
		const k = attachable.find((x) => x.rel === attachRel)?.kind;
		if (k === 'audio') attachRole = 'playback';
		else if (k === 'video') attachRole = 'visuals';
		else if (k === 'model') attachRole = 'model';
	}

	const smallInput =
		'w-full rounded-[7px] border bg-card px-2 py-[7px] text-[13px] outline-none focus:border-ring';
	const tinyLabel = 'mb-1 font-mono text-[9px] tracking-[0.08em] text-muted-foreground';
	const ghostBtn =
		'cursor-pointer font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground/70';
</script>

{#if !p.rundown}
	<!-- Empty state — any project can become a show -->
	<div class="grid place-items-center rounded-[12px] border bg-card px-6 py-16">
		<ListMusic class="mb-3 size-8 text-muted-foreground" />
		<div class="mb-1 text-[15px] font-semibold">No rundown yet</div>
		<div class="mb-5 max-w-[380px] text-center text-[13px] text-muted-foreground">
			Build the show: sections, songs, and the audio, video, and 3D files each song uses.
		</div>
		<button
			onclick={() => t.createRundown(p.id)}
			class="cursor-pointer rounded-[9px] bg-primary px-[18px] py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
			>Start a rundown</button
		>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<!-- Stats -->
		<div class="flex flex-wrap items-center gap-x-[30px] gap-y-2 px-0.5 pb-1.5 pt-0.5">
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">SONGS</span>
				<span class="text-[20px] font-extrabold">{totals.count}</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">RUNTIME</span>
				<span class="font-mono text-[15px] font-semibold text-foreground/70">{fmtDur(totals.total)}</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">SECTIONS</span>
				<span class="text-[15px] font-bold">{sections.length}</span>
			</div>
		</div>

		{#each sections as sec, si (si)}
			<div>
				<div class="group/sec mx-0.5 mb-3 mt-1.5 flex items-center gap-3">
					<input
						value={sec.name}
						onchange={(e) => t.renameSection(p.id, si, e.currentTarget.value)}
						aria-label="Section name"
						class="w-auto min-w-0 max-w-[320px] rounded-[5px] border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/70 outline-none hover:border-border focus:border-ring"
					/>
					<span class="h-px flex-1 bg-border"></span>
					<span class="font-mono text-[10px] text-muted-foreground"
						>{sec.songs.length} songs · {fmtDur(secDur(sec.songs))}</span
					>
					{#if !sec.songs.length}
						<button
							onclick={() => t.removeSection(p.id, si)}
							title="Remove empty section"
							class="hidden cursor-pointer text-muted-foreground hover:text-destructive group-hover/sec:block"
							><X class="size-3.5" /></button
						>
					{/if}
				</div>

				<div class="flex flex-col gap-2.5">
					{#each sec.songs as song (song.id)}
						{@const expanded = !!t.openSongs[song.id]}
						<div class="overflow-hidden rounded-[12px] border bg-card">
							<!-- Song header row -->
							<div
								role="button"
								tabindex="0"
								onclick={() => t.toggleSong(song.id)}
								onkeydown={(e) => e.key === 'Enter' && t.toggleSong(song.id)}
								class="flex cursor-pointer items-center gap-3.5 px-[18px] py-3.5 hover:bg-accent/50"
							>
								<span
									class="grid size-[34px] flex-none place-items-center rounded-[8px] bg-secondary font-mono text-[13px] font-semibold text-foreground/70"
									>{String(song.order).padStart(2, '0')}</span
								>
								<div class="min-w-0 flex-1">
									<div class="text-[15px] font-semibold">
										{song.title}
										{#if song.artist}<span class="text-[13px] font-normal text-muted-foreground"
												>{song.artist}</span
											>{/if}
									</div>
									<div class="mt-1 font-mono text-[11px] text-muted-foreground">{metaLine(song)}</div>
								</div>
								<div class="flex flex-wrap justify-end gap-1.5">
									{#each readyDefs as rd (rd.key)}
										{@const on = song.ready[rd.key]}
										<button
											onclick={(e) => {
												e.stopPropagation();
												t.toggleReady(p.id, song.id, rd.key);
											}}
											class="inline-flex cursor-pointer items-center gap-1.5 rounded-[16px] border px-2.5 py-[5px] font-mono text-[9px] uppercase tracking-[0.05em]"
											style={on
												? `background:${rd.color};color:#fff;border-color:${rd.color};`
												: 'background:transparent;color:#a8a296;'}
										>
											<span class="size-1.5 rounded-full" style="background:{on ? '#fff' : '#cfc9bb'};"></span>{rd.label}
										</button>
									{/each}
								</div>
							</div>

							<!-- Expanded detail -->
							{#if expanded}
								<div class="border-t">
									<!-- Editable song details -->
									<div class="flex flex-wrap items-end gap-2.5 px-[18px] pt-4">
										<div class="min-w-[160px] flex-1">
											<div class={tinyLabel}>TITLE</div>
											<input
												value={song.title}
												onchange={(e) => t.updateSong(p.id, song.id, { title: e.currentTarget.value })}
												class={smallInput}
											/>
										</div>
										<div class="min-w-[120px] flex-1">
											<div class={tinyLabel}>ARTIST / NOTE</div>
											<input
												value={song.artist}
												onchange={(e) => t.updateSong(p.id, song.id, { artist: e.currentTarget.value })}
												class={smallInput}
											/>
										</div>
										<div class="w-[64px]">
											<div class={tinyLabel}>DUR</div>
											<input
												value={fmtDur(song.dur || 0)}
												onchange={(e) =>
													t.updateSong(p.id, song.id, { dur: parseDur(e.currentTarget.value) })}
												class="{smallInput} font-mono text-[12px]"
											/>
										</div>
										<div class="w-[58px]">
											<div class={tinyLabel}>KEY</div>
											<input
												value={song.key}
												onchange={(e) => t.updateSong(p.id, song.id, { key: e.currentTarget.value })}
												class="{smallInput} font-mono text-[12px]"
											/>
										</div>
										<div class="w-[64px]">
											<div class={tinyLabel}>BPM</div>
											<input
												value={song.bpm || ''}
												onchange={(e) =>
													t.updateSong(p.id, song.id, { bpm: parseInt(e.currentTarget.value, 10) || 0 })}
												class="{smallInput} font-mono text-[12px]"
											/>
										</div>
										<button
											onclick={() => t.removeSong(p.id, song.id)}
											title="Remove song"
											class="mb-1 cursor-pointer p-1 text-muted-foreground hover:text-destructive"
											><X class="size-4" /></button
										>
									</div>

									<div class="grid grid-cols-3 gap-[22px] px-[18px] py-4">
										<!-- Performers -->
										<div>
											<div class="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
												PERFORMERS
											</div>
											{#each song.performers as pf, pi (pi)}
												<div class="group/pf flex items-center gap-2.5 py-[5px]">
													<span
														class="grid size-[26px] flex-none place-items-center rounded-full bg-secondary font-mono text-[9px] text-foreground/70"
														>{initials(pf.name || '?')}</span
													>
													<input
														value={pf.name}
														onchange={(e) =>
															t.updatePerformer(p.id, song.id, pi, { name: e.currentTarget.value })}
														aria-label="Performer name"
														class="min-w-0 flex-1 rounded-[5px] border border-transparent bg-transparent px-1 py-0.5 text-[13px] outline-none hover:border-border focus:border-ring"
													/>
													<input
														value={pf.part}
														onchange={(e) =>
															t.updatePerformer(p.id, song.id, pi, { part: e.currentTarget.value })}
														aria-label="Part"
														class="w-[80px] rounded-[5px] border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[10px] text-muted-foreground outline-none hover:border-border focus:border-ring"
													/>
													<button
														onclick={() => t.removePerformer(p.id, song.id, pi)}
														title="Remove performer"
														class="hidden cursor-pointer text-muted-foreground hover:text-destructive group-hover/pf:block"
														><X class="size-3" /></button
													>
												</div>
											{/each}
											<button onclick={() => t.addPerformer(p.id, song.id)} class="mt-2 {ghostBtn}"
												>+ Add performer</button
											>
										</div>

										<!-- Files -->
										<div>
											<div class="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
												FILES
											</div>
											{#each song.files as f, fi (fi)}
												{@const m = SONG_FILE_MAP[f.type] ?? SONG_FILE_MAP.track}
												{@const pv = filePreview(f.name, f.type)}
												<div class="group/sf flex items-center gap-2.5 py-[5px]">
													<FileThumb preview={pv} size={34} />
													<div class="min-w-0 flex-1">
														<div class="truncate text-[12.5px]">{f.name}</div>
														<div class="mt-[3px] font-mono text-[9px]" style="color:{m.color};">
															{m.code} · {pv.ext}
														</div>
													</div>
													{#if f.rel}
														<button
															onclick={() => t.openLocal(p.id, f.rel)}
															title="Open in native app"
															class="hidden cursor-pointer rounded-[5px] border px-1.5 py-0.5 font-mono text-[8px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80 group-hover/sf:block"
															>OPEN</button
														>
													{/if}
													<button
														onclick={() => t.removeSongFile(p.id, song.id, fi)}
														title="Detach file"
														class="hidden cursor-pointer text-muted-foreground hover:text-destructive group-hover/sf:block"
														><X class="size-3" /></button
													>
												</div>
											{/each}

											{#if attachFor === song.id}
												<div class="mt-2 flex flex-col gap-1.5 rounded-[8px] border bg-muted/60 p-2">
													<select bind:value={attachRel} onchange={suggestRole} class={smallInput}>
														<option value="" disabled>Choose a file…</option>
														{#each attachable as af (af.rel)}
															<option value={af.rel}>{af.name} ({af.kind})</option>
														{/each}
													</select>
													<div class="flex gap-1.5">
														<select bind:value={attachRole} class={smallInput}>
															{#each ROLES as r (r)}
																<option value={r}>{SONG_FILE_MAP[r].code}</option>
															{/each}
														</select>
														<button
															onclick={() => doAttach(song.id)}
															disabled={!attachRel}
															class="cursor-pointer rounded-[7px] bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40"
															>Add</button
														>
														<button onclick={() => (attachFor = null)} class={ghostBtn}>Cancel</button>
													</div>
												</div>
											{:else if attachable.length}
												<button
													onclick={() => {
														attachFor = song.id;
														attachRel = '';
													}}
													class="mt-2 {ghostBtn}">+ Attach file</button
												>
											{:else}
												<div class="mt-2 text-[11px] text-muted-foreground">
													Link a project folder to attach real files.
												</div>
											{/if}
										</div>

										<!-- Resources -->
										<div>
											<div class="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
												RESOURCES
											</div>
											{#each song.resources as r (r.label)}
												<div class="flex items-center gap-2.5 py-[5px]">
													<span class="w-[18px] flex-none text-center" style="color:#c68a1a;"
														>{RES_ICON[r.type] ?? '↗'}</span
													>
													<span class="flex-1 cursor-pointer text-[12.5px] hover:underline" style="color:#3a6ea5;"
														>{r.label}</span
													>
												</div>
											{/each}
										</div>
									</div>

									<div class="px-[18px] pb-4">
										<div class="mb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
											NOTE
										</div>
										<textarea
											value={song.notes}
											rows="2"
											placeholder="Cues, transitions, gear…"
											onchange={(e) => t.updateSong(p.id, song.id, { notes: e.currentTarget.value })}
											class="w-full resize-y rounded-[7px] border bg-card px-2.5 py-2 text-[13px] leading-[1.5] outline-none focus:border-ring"
										></textarea>
									</div>
								</div>
							{/if}
						</div>
					{/each}

					<button
						onclick={() => t.addSong(p.id, si)}
						class="cursor-pointer rounded-[10px] border border-dashed p-[11px] text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:border-ring/40 hover:text-foreground/70"
						>+ Add song</button
					>
				</div>
			</div>
		{/each}

		<button
			onclick={() => t.addSection(p.id)}
			class="cursor-pointer self-start rounded-[10px] border border-dashed px-4 py-[9px] font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:border-ring/40 hover:text-foreground/70"
			>+ Add section</button
		>
	</div>
{/if}
