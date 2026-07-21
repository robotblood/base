<script lang="ts">
	import type { Tracker } from '$lib/projects/tracker.svelte';
	import {
		fmtDur,
		filePreview,
		initials,
		SONG_FILE_MAP,
		RES_ICON,
		type Project,
		type Song
	} from '$lib/projects/data';
	import FileThumb from './FileThumb.svelte';

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
</script>

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

	{#each sections as sec, si (sec.name)}
		<div>
			<div class="mx-0.5 mb-3 mt-1.5 flex items-center gap-3">
				<span class="font-mono text-[11px] tracking-[0.14em] text-foreground/70">{sec.name}</span>
				<span class="h-px flex-1 bg-border"></span>
				<span class="font-mono text-[10px] text-muted-foreground"
					>{sec.songs.length} songs · {fmtDur(secDur(sec.songs))}</span
				>
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
								<div class="grid grid-cols-3 gap-[22px] px-[18px] py-4">
									<!-- Performers -->
									<div>
										<div class="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
											PERFORMERS
										</div>
										{#each song.performers as pf (pf.name + pf.part)}
											<div class="flex items-center gap-2.5 py-[5px]">
												<span
													class="grid size-[26px] flex-none place-items-center rounded-full bg-secondary font-mono text-[9px] text-foreground/70"
													>{initials(pf.name)}</span
												>
												<span class="min-w-0 flex-1 text-[13px]">{pf.name}</span>
												<span class="text-right font-mono text-[10px] text-muted-foreground">{pf.part}</span>
											</div>
										{/each}
										<button
											onclick={() => t.addPerformer(p.id, song.id)}
											class="mt-2 cursor-pointer font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground/70"
											>+ Add performer</button
										>
									</div>

									<!-- Files -->
									<div>
										<div class="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
											FILES
										</div>
										{#each song.files as f (f.name)}
											{@const m = SONG_FILE_MAP[f.type] ?? SONG_FILE_MAP.track}
											{@const pv = filePreview(f.name, f.type)}
											<div class="flex items-center gap-2.5 py-[5px]">
												<FileThumb preview={pv} size={34} />
												<div class="min-w-0 flex-1">
													<div class="truncate text-[12.5px]">{f.name}</div>
													<div class="mt-[3px] font-mono text-[9px]" style="color:{m.color};">
														{m.code} · {pv.ext}
													</div>
												</div>
											</div>
										{/each}
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

								{#if song.notes}
									<div class="px-[18px] pb-4">
										<div class="mb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
											NOTE
										</div>
										<div class="text-[13px] leading-[1.5] text-foreground/70">{song.notes}</div>
									</div>
								{/if}
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
</div>
