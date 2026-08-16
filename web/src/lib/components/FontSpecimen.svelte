<script lang="ts">
	// One typeface, actually rendered in itself — the visual primitive the font
	// library and any "show me the type" surface are built from.
	//
	// The interesting part is what it does when it *can't* render. A specimen
	// that silently falls back to system-ui is worse than no specimen: it shows
	// you Arial and labels it Druk. So a face is only drawn after its @font-face
	// is confirmed loaded, and the two ways that can fail — catalogued with no
	// file (commercial licence), or declared but not actually there (missing
	// woff2, uninstalled package) — each get their own visible state.
	import '$lib/design/typefaces.css';
	import { defaultVariation, primaryFamily, type Typeface } from '$lib/design/typefaces';

	let {
		face,
		sample,
		size = 46,
		axisValues,
		tracking = 0,
		showMeta = true
	}: {
		face: Typeface;
		/** Overrides the face's own `sample`, then the default. */
		sample?: string;
		/** Specimen size in px. */
		size?: number;
		/** Variable axis overrides by tag, e.g. `{ wdth: 100 }`. */
		axisValues?: Record<string, number>;
		/** Letter-spacing in em — square techno faces want a little. */
		tracking?: number;
		/** Show the foundry / licence / note block under the specimen. */
		showMeta?: boolean;
	} = $props();

	const DEFAULT_SAMPLE = 'ROBOTBLOOD';

	const text = $derived(sample ?? face.sample ?? DEFAULT_SAMPLE);

	// Axis overrides win over the registry defaults; faces with no axes get ''.
	const variation = $derived(
		face.axes?.length
			? face.axes
					.map((a) => `"${a.tag}" ${axisValues?.[a.tag] ?? a.def}`)
					.join(', ')
			: defaultVariation(face)
	);

	type Status = 'checking' | 'ready' | 'missing';
	let status = $state<Status>('checking');

	const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '');

	$effect(() => {
		const stack = face.family;
		if (!stack) return;
		const name = primaryFamily(stack);
		// A layered face activates every cut before drawing, so the stack
		// arrives whole instead of assembling layer by layer.
		const names = face.layers?.length ? face.layers.map(primaryFamily) : [name];
		let alive = true;
		status = 'checking';
		(async () => {
			try {
				// Activate the face for this text, then look it up among the
				// registered rules. document.fonts.check() can't answer this on
				// its own: for a family nothing declares, it returns true on the
				// strength of the fallback — the exact lie being avoided here.
				await Promise.all(names.map((n) => document.fonts.load(`${size}px "${n}"`, text)));
				if (!alive) return;
				const rules = [...document.fonts].filter((f) => unquote(f.family) === name);
				status = rules.some((f) => f.status === 'loaded') ? 'ready' : 'missing';
			} catch {
				if (alive) status = 'missing';
			}
		})();
		return () => {
			alive = false;
		};
	});

	const LICENCE_LABEL: Record<string, string> = {
		libre: 'libre',
		commercial: 'licensed',
		unknown: 'licence unknown'
	};
</script>

<figure class="m-0 flex flex-col gap-3">
	{#if !face.family}
		<!-- Catalogued, no file: say why, and don't pretend to draw it. -->
		<div
			class="flex min-h-[92px] flex-col justify-center gap-1.5 rounded-[10px] border border-dashed bg-muted/40 px-5 py-4"
		>
			<span class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
				no specimen
			</span>
			<p class="max-w-prose text-[12px] leading-relaxed text-muted-foreground">
				{face.unavailable ?? 'No file is bundled for this face.'}
			</p>
		</div>
	{:else if status === 'missing'}
		<!-- Declared but absent — a broken file or an uninstalled package. -->
		<div
			class="flex min-h-[92px] flex-col justify-center gap-1.5 rounded-[10px] border border-destructive/40 bg-destructive/5 px-5 py-4"
		>
			<span class="font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
				font not loaded
			</span>
			<p class="max-w-prose text-[12px] leading-relaxed text-muted-foreground">
				<code class="font-mono">{primaryFamily(face.family)}</code> is registered in the library but
				the browser has no face for it — check the file under
				<code class="font-mono">static/typefaces</code> or its @fontsource package.
			</p>
		</div>
	{:else}
		<div
			class="overflow-x-auto rounded-[10px] border bg-background px-5 py-4"
			class:opacity-0={status === 'checking'}
			style="transition:opacity 120ms ease;"
		>
			{#if face.layers?.length}
				<!-- Layered face: every cut drawn on the same text, bottom layer
				     faintest, top layer at full strength. Shades of the foreground
				     rather than fixed colours so the stack survives both themes. -->
				<div
					class="relative w-fit whitespace-nowrap leading-[1.08]"
					style="font-size:{size}px;font-weight:{face.weight ?? 400};letter-spacing:{tracking}em;"
				>
					{#each face.layers as layer, i (i)}
						<div
							class={i === 0 ? '' : 'absolute inset-0'}
							style="font-family:{layer};color:color-mix(in oklab, var(--foreground) {Math.round(
								30 + (70 * i) / Math.max(1, face.layers.length - 1)
							)}%, transparent);"
							aria-hidden={i > 0}
						>
							{text}
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="whitespace-nowrap leading-[1.08] text-foreground"
					style="font-family:{face.family};font-size:{size}px;font-variation-settings:{variation ||
						'normal'};font-weight:{face.weight ?? 400};letter-spacing:{tracking}em;"
				>
					{text}
				</div>
			{/if}
		</div>
	{/if}

	{#if showMeta}
		<figcaption class="flex flex-col gap-1.5">
			<div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<span class="text-[13px] font-bold">{face.name}</span>
				<span class="font-mono text-[11px] text-muted-foreground">
					{face.foundry}{face.designer ? ` · ${face.designer}` : ''}
				</span>
				<span
					class="rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
					class:bg-muted={face.licence !== 'commercial'}
					class:text-muted-foreground={face.licence !== 'commercial'}
					style={face.licence === 'commercial'
						? 'background:color-mix(in oklch, var(--destructive) 12%, transparent);color:var(--destructive);'
						: ''}
				>
					{LICENCE_LABEL[face.licence]}
				</span>
			</div>
			{#if face.note}
				<p class="max-w-prose text-[12px] leading-relaxed text-muted-foreground">{face.note}</p>
			{/if}
			{#if face.url}
				<a
					class="w-fit font-mono text-[11px] text-signal hover:underline"
					href={face.url}
					target="_blank"
					rel="noreferrer noopener"
				>
					{face.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
				</a>
			{/if}
		</figcaption>
	{/if}
</figure>
