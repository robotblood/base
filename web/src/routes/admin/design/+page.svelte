<script lang="ts">
	import { onDestroy } from 'svelte';
	import { mode, setMode } from 'mode-watcher';
	import { contrast, grade } from '$lib/design/color';
	import {
		DEFAULTS,
		FONTS,
		SCALE_RATIOS,
		deriveVars,
		fontStack,
		toCss,
		type DesignConfig,
		type Mode
	} from '$lib/design/tokens';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Copy from '@lucide/svelte/icons/copy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the server once and then owned by this page. It must *not*
	// track `data`: this is an editor, and a re-render that reset your
	// in-progress palette to the last saved one would throw away live edits.
	// svelte-ignore state_referenced_locally
	let config = $state<DesignConfig>(structuredClone(data.config));
	// Which palette the colour controls edit. Switching it also switches the
	// app's own mode: you should be looking at dark while you edit dark.
	let editing = $state<Mode>(mode.current === 'dark' ? 'dark' : 'light');
	// svelte-ignore state_referenced_locally
	let status = $state(data.saved ? 'Saved' : 'Using built-in defaults');

	const palette = $derived(config.color[editing]);
	const vars = $derived(deriveVars(config, editing));
	// Two serialisations with different jobs: the pretty one is shown and
	// copied, the compact one is what autosave compares and sends. They must
	// not be interchanged — comparing a pretty string against a compact one
	// never matches, which would fire a save on every mount.
	const configJson = $derived(JSON.stringify(config, null, 2));
	const configCompact = $derived(JSON.stringify(config));

	// ------------------------------------------------------------ live preview
	// The page previews itself: tokens are written straight to the document, so
	// the sidebar, this page's own chrome, and the specimens below all move
	// together. There is no separate "preview theme" that could drift from the
	// real one.
	const PREVIEW_ID = 'base-theme-preview';

	$effect(() => {
		const css = toCss(config);
		let el = document.getElementById(PREVIEW_ID);
		if (!el) {
			el = document.createElement('style');
			el.id = PREVIEW_ID;
			document.head.appendChild(el);
		}
		el.textContent = css;
	});

	// Leaving the page drops the preview: whatever the server rendered into
	// the server-rendered style#base-theme is the saved truth, and unsaved edits should not
	// outlive the editor.
	onDestroy(() => {
		if (typeof document !== 'undefined') document.getElementById(PREVIEW_ID)?.remove();
	});

	// --------------------------------------------------------------- autosave
	// The snapshot the autosave compares against, so mounting never triggers a
	// write. Same reasoning as `config` — seeded once, then owned here.
	// svelte-ignore state_referenced_locally
	let lastSaved = $state(JSON.stringify(data.config));
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const current = configCompact;
		if (current === lastSaved) return;
		status = 'Saving…';
		clearTimeout(timer);
		timer = setTimeout(() => void save(current), 500);
	});

	async function save(snapshot: string) {
		try {
			const res = await fetch('/admin/design/save', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: snapshot
			});
			if (!res.ok) throw new Error(await res.text());
			lastSaved = snapshot;
			status = `Saved ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		} catch (e) {
			status = `Save failed — ${e instanceof Error ? e.message : 'unknown error'}`;
		}
	}

	async function reset() {
		clearTimeout(timer);
		await fetch('/admin/design/save', { method: 'DELETE' });
		config = structuredClone(DEFAULTS);
		lastSaved = JSON.stringify(DEFAULTS);
		status = 'Reset to built-in defaults';
	}

	function switchMode(next: Mode) {
		editing = next;
		setMode(next);
	}

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			status = `${what} copied`;
		} catch {
			status = 'Clipboard unavailable';
		}
	}

	// ------------------------------------------------------------- specimens
	const t = $derived(config.typography);

	// H1 sits five steps up the scale from the base size, H6 on it — the same
	// arrangement the prototype used, so the ratio control reads the way it did.
	const scale = $derived(
		[5, 4, 3, 2, 1, 0].map((step, i) => ({
			tag: `H${i + 1}`,
			size: t.baseSize * Math.pow(t.scaleRatio, step)
		}))
	);

	const COLOR_TOKENS: { key: keyof typeof palette; label: string; hint: string }[] = [
		{ key: 'bg', label: 'Background', hint: 'The page behind everything' },
		{ key: 'surface', label: 'Surface', hint: 'Cards, popovers, inputs' },
		{ key: 'text', label: 'Text', hint: 'Body copy and headings' },
		{ key: 'muted', label: 'Muted text', hint: 'Captions, labels, metadata' },
		{ key: 'border', label: 'Border', hint: 'Rules, dividers, input outlines' },
		{ key: 'accent', label: 'Accent', hint: 'Signal colour, rings, charts' },
		{ key: 'onAccent', label: 'On accent', hint: 'Text on a filled accent' }
	];

	const SEMANTIC: { key: keyof DesignConfig['color']['semantic']; label: string }[] = [
		{ key: 'success', label: 'Success' },
		{ key: 'warning', label: 'Warning' },
		{ key: 'danger', label: 'Danger' },
		{ key: 'info', label: 'Info' }
	];

	const checks = $derived([
		{ label: 'Text on background', fg: palette.text, bg: palette.bg },
		{ label: 'Muted on background', fg: palette.muted, bg: palette.bg },
		{ label: 'Text on surface', fg: palette.text, bg: palette.surface },
		{ label: 'Accent on background', fg: palette.accent, bg: palette.bg },
		{ label: 'On-accent on accent', fg: palette.onAccent, bg: palette.accent }
	]);

	// Interface-mock helpers: heading style N steps up the scale, body style,
	// and the live radius — called from the template so they track the tokens.
	const hSize = (step: number) => t.baseSize * Math.pow(t.scaleRatio, step);
	const headStyle = (step: number) =>
		`font-family:${fontStack(t.headingFont)};font-size:${hSize(step)}px;font-weight:${t.headingWeight};line-height:${t.headingLineHeight}`;
	const bodyStyle = $derived(
		`font-family:${fontStack(t.bodyFont)};font-size:${t.baseSize}px;font-weight:${t.bodyWeight};line-height:${t.bodyLineHeight}`
	);
	const r = $derived(`border-radius:${config.shape.radius}px`);

	const card = 'rounded-[12px] border bg-card';
	const sectionHead =
		'mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground';
	const label = 'mb-1 block text-[12px] font-medium text-foreground/80';
	const input =
		'w-full rounded-[7px] border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-ring';
</script>

<svelte:head><title>base — admin · design</title></svelte:head>

{#snippet slider(
	text: string,
	value: number,
	min: number,
	max: number,
	step: number,
	set: (v: number) => void,
	suffix = ''
)}
	<div class="mb-3">
		<div class="mb-1 flex items-baseline justify-between">
			<span class="text-[12px] font-medium text-foreground/80">{text}</span>
			<span class="font-mono text-[11px] tabular-nums text-muted-foreground">
				{value}{suffix}
			</span>
		</div>
		<input
			type="range"
			class="w-full accent-signal"
			{min}
			{max}
			{step}
			{value}
			oninput={(e) => set(Number(e.currentTarget.value))}
		/>
	</div>
{/snippet}

{#snippet fontSelect(text: string, value: string, set: (v: string) => void, only?: string)}
	<div class="mb-3">
		<span class={label}>{text}</span>
		<select class={input} {value} onchange={(e) => set(e.currentTarget.value)}>
			{#each ['sans', 'serif', 'mono'] as group (group)}
				{@const list = FONTS.filter((f) => f.category === group && (!only || group === only))}
				{#if list.length}
					<optgroup label={group}>
						{#each list as f (f.label)}
							<option value={f.label}>{f.label}</option>
						{/each}
					</optgroup>
				{/if}
			{/each}
		</select>
	</div>
{/snippet}

{#snippet swatch(text: string, hex: string, set: (v: string) => void, hint?: string)}
	<div class="mb-2.5">
		<div class="flex items-center gap-2">
			<input
				type="color"
				class="size-7 shrink-0 cursor-pointer rounded-[6px] border bg-transparent p-0.5"
				value={hex}
				oninput={(e) => set(e.currentTarget.value.toUpperCase())}
				aria-label={text}
			/>
			<div class="min-w-0 flex-1">
				<div class="text-[12px] font-medium leading-tight">{text}</div>
				{#if hint}
					<div class="truncate text-[10px] text-muted-foreground">{hint}</div>
				{/if}
			</div>
			<input
				class="w-[86px] shrink-0 rounded-[6px] border bg-background px-1.5 py-1 font-mono text-[11px] uppercase outline-none focus:border-ring"
				value={hex}
				onchange={(e) => {
					const v = e.currentTarget.value.trim();
					if (/^#?[0-9a-f]{6}$/i.test(v)) set((v.startsWith('#') ? v : `#${v}`).toUpperCase());
					else e.currentTarget.value = hex;
				}}
			/>
		</div>
	</div>
{/snippet}

<div class="flex min-h-[calc(100vh-3.75rem)]">
	<!-- Controls. Sticky, so the specimens scroll past a fixed instrument panel. -->
	<aside
		class="sticky top-0 h-[calc(100vh-3.75rem)] w-[300px] shrink-0 overflow-y-auto border-r bg-sidebar/40 px-5 py-6"
	>
		<div class={sectionHead}>Typography</div>
		{@render fontSelect('Heading font', t.headingFont, (v) => (config.typography.headingFont = v))}
		{@render fontSelect('Body font', t.bodyFont, (v) => (config.typography.bodyFont = v))}
		{@render fontSelect(
			'Mono font',
			t.monoFont,
			(v) => (config.typography.monoFont = v),
			'mono'
		)}
		{@render slider(
			'Base size',
			t.baseSize,
			14,
			20,
			0.5,
			(v) => (config.typography.baseSize = v),
			'px'
		)}
		<div class="mb-3">
			<span class={label}>Type scale</span>
			<select
				class={input}
				value={String(t.scaleRatio)}
				onchange={(e) => (config.typography.scaleRatio = Number(e.currentTarget.value))}
			>
				{#each SCALE_RATIOS as r (r.value)}
					<option value={String(r.value)}>{r.label}</option>
				{/each}
			</select>
		</div>
		{@render slider(
			'Heading weight',
			t.headingWeight,
			400,
			800,
			100,
			(v) => (config.typography.headingWeight = v)
		)}
		{@render slider(
			'Body weight',
			t.bodyWeight,
			300,
			600,
			100,
			(v) => (config.typography.bodyWeight = v)
		)}
		{@render slider(
			'Heading line height',
			t.headingLineHeight,
			1,
			1.6,
			0.05,
			(v) => (config.typography.headingLineHeight = v)
		)}
		{@render slider(
			'Body line height',
			t.bodyLineHeight,
			1.3,
			2,
			0.05,
			(v) => (config.typography.bodyLineHeight = v)
		)}

		<div class="mb-2 mt-6 flex items-center justify-between">
			<span class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
				Color
			</span>
			<div class="inline-flex gap-0.5 rounded-[7px] bg-muted p-[2px]">
				{#each ['light', 'dark'] as const as m (m)}
					<button
						type="button"
						class={`cursor-pointer rounded-[5px] px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
							editing === m ? 'bg-primary text-primary-foreground' : 'text-foreground/70'
						}`}
						onclick={() => switchMode(m)}
					>
						{m}
					</button>
				{/each}
			</div>
		</div>
		<p class="mb-3 text-[11px] leading-snug text-muted-foreground">
			Editing the {editing} palette — the whole app follows along as you change it.
		</p>
		{#each COLOR_TOKENS as tok (tok.key)}
			{@render swatch(
				tok.label,
				palette[tok.key],
				(v) => (config.color[editing][tok.key] = v),
				tok.hint
			)}
		{/each}

		<div class="mb-3 mt-6 {sectionHead}">Semantic</div>
		<p class="mb-3 -mt-2 text-[11px] leading-snug text-muted-foreground">
			Shared across both themes — these encode meaning, so they must not invert.
		</p>
		{#each SEMANTIC as s (s.key)}
			{@render swatch(s.label, config.color.semantic[s.key], (v) => (config.color.semantic[s.key] = v))}
		{/each}

		<div class="mb-3 mt-6 {sectionHead}">Shape &amp; density</div>
		{@render slider('Corner radius', config.shape.radius, 0, 20, 1, (v) => (config.shape.radius = v), 'px')}
		<div class="mb-3">
			<span class={label}>Density</span>
			<select
				class={input}
				value={config.spacing.density}
				onchange={(e) =>
					(config.spacing.density = e.currentTarget
						.value as DesignConfig['spacing']['density'])}
			>
				<option value="compact">Compact</option>
				<option value="comfortable">Comfortable</option>
				<option value="roomy">Roomy</option>
			</select>
		</div>

		<div class="mt-6 flex flex-col gap-2">
			<Button variant="outline" size="sm" onclick={() => copy(configJson, 'Tokens')}>
				<Copy class="size-3.5" /> Copy tokens as JSON
			</Button>
			<Button variant="outline" size="sm" onclick={() => copy(toCss(config), 'CSS')}>
				<Copy class="size-3.5" /> Copy as CSS variables
			</Button>
			<Button variant="ghost" size="sm" onclick={reset}>
				<RotateCcw class="size-3.5" /> Reset to defaults
			</Button>
		</div>
	</aside>

	<!-- Specimens -->
	<div class="min-w-0 flex-1 px-9 pb-16 pt-7">
		<PageHeader
			code="ADMIN / DESIGN"
			title="Design system"
			subtitle={`${status} · every element below is rendered from these tokens`}
		/>

		<!-- The interface itself, modelled — not a list of specimens. Everything
		     in the mock uses the app's own semantic classes plus the live
		     typography tokens, so it moves with every control on the left. -->
		<section class="mb-8">
			<div class={sectionHead}>The interface — a live model, not a specimen list</div>
			<div class="overflow-hidden border bg-background" style={r}>
				<div class="grid sm:grid-cols-[170px_1fr]">
					<!-- mini sidebar -->
					<div class="hidden border-r bg-sidebar/40 px-3 py-4 sm:block">
						<div class="mb-4 flex items-center gap-2">
							<span
								class="grid size-6 place-items-center bg-primary font-mono text-[10px] font-bold text-primary-foreground"
								style={r}>b</span
							>
							<span class="text-[12px] font-bold" style={`font-family:${fontStack(t.headingFont)}`}>base</span>
						</div>
						{#each [['PROJ', 'Projects', '81'], ['NOTE', 'Notes', '462'], ['DOCU', 'Documents', '0']] as [code, name, n] (code)}
							<div class="flex items-center gap-2 px-1.5 py-[5px]">
								<span class="w-8 font-mono text-[8px] text-muted-foreground">{code}</span>
								<span class="flex-1 text-[12px]" style={`font-family:${fontStack(t.bodyFont)}`}>{name}</span>
								<span class="font-mono text-[10px] text-muted-foreground">{n}</span>
							</div>
						{/each}
					</div>
					<!-- mini page -->
					<div class="min-w-0 px-6 py-5">
						<div class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Graphics · In Progress
						</div>
						<div class="mb-3 mt-1 truncate" style={headStyle(3)}>Autumn Website</div>
						<div class="mb-4 flex flex-wrap gap-2">
							<button class="cursor-pointer bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-primary-foreground" style={r}>Open folder</button>
							<button class="cursor-pointer border bg-card px-3.5 py-1.5 text-[12px] font-semibold text-foreground/80" style={r}>Add files</button>
							<span class="inline-flex items-center gap-1.5 self-center border px-2.5 py-1 text-[11px] font-medium text-foreground/70" style={`${r};border-radius:20px`}>
								<span class="size-[6px] rounded-full" style={`background:${config.color.semantic.info}`}></span>In Progress
							</span>
						</div>
						<div class="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
							<!-- example card: graphic, H2, H3, text, table -->
							<div class="overflow-hidden border bg-card" style={r}>
								<div
									class="h-24"
									style={`background:linear-gradient(120deg, color-mix(in srgb, ${palette.accent} 55%, ${palette.surface}), color-mix(in srgb, ${palette.accent} 18%, ${palette.surface}))`}
								></div>
								<div class="px-5 py-4">
									<div style={headStyle(2)}>The hero card</div>
									<div class="mb-1 mt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground" style={`font-size:${Math.max(10, hSize(0) * 0.72)}px`}>
										H3 · Section label
									</div>
									<p class="text-foreground/85" style={bodyStyle}>
										Body text carries the interface. The graphic above tints from your accent;
										every surface, rule and radius here follows the tokens.
									</p>
									<div class="mt-3 border-t">
										{#each [['Owl Tee (M)', '14 on hand', 'success', 'OK'], ['Tour Poster', '3 on hand', 'danger', 'LOW']] as [name, meta, sem, flag] (name)}
											<div class="flex items-center gap-3 border-b py-2 last:border-b-0">
												<span class="flex-1 truncate text-[13px]" style={`font-family:${fontStack(t.bodyFont)}`}>{name}</span>
												<span class="font-mono text-[11px] text-muted-foreground">{meta}</span>
												<span
													class="px-1.5 py-[2px] font-mono text-[9px] font-semibold uppercase"
													style={`border-radius:${Math.min(config.shape.radius, 6)}px;background:color-mix(in srgb, ${config.color.semantic[sem as 'success' | 'danger']} 16%, transparent);color:${config.color.semantic[sem as 'success' | 'danger']}`}
													>{flag}</span
												>
											</div>
										{/each}
									</div>
								</div>
							</div>
							<!-- example doc: H1/H2/H3/text/todo, the note editor's shape -->
							<div class="border bg-card px-5 py-4" style={r}>
								<div class="mb-2 flex items-center justify-between">
									<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Document</span>
									<span class="font-mono text-[9px] text-muted-foreground">● all changes saved</span>
								</div>
								<div style={headStyle(1)}>H2 in a note</div>
								<p class="mt-1 text-foreground/85" style={bodyStyle}>
									Writing feels right when the type does.
								</p>
								{#each ['Check the proofs', 'Send the invoice'] as todo, i (todo)}
									<div class="mt-2 flex items-center gap-2.5">
										<span
											class="grid size-[17px] place-items-center border-[1.5px]"
											style={`border-radius:${Math.min(config.shape.radius, 5)}px;${i === 0 ? `background:${config.color.semantic.success};border-color:${config.color.semantic.success}` : 'border-color:var(--border)'}`}
										>
											{#if i === 0}<span class="text-[11px] leading-none text-white">✓</span>{/if}
										</span>
										<span class="text-[13.5px] {i === 0 ? 'text-muted-foreground line-through' : ''}" style={`font-family:${fontStack(t.bodyFont)}`}>{todo}</span>
									</div>
								{/each}
								<a href="/admin/design" class="mt-3 inline-block text-[13px] underline underline-offset-3" style={`color:${palette.accent}`}>A link, in accent</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="mb-8">
			<div class={sectionHead}>
				Type scale — {t.baseSize}px base · {t.scaleRatio} · {t.headingFont} / {t.bodyFont}
			</div>
			<div class={card}>
				<div class="divide-y">
					{#each scale as s (s.tag)}
						<div class="flex items-baseline gap-5 px-5 py-3">
							<span class="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
								{s.tag}<br /><span class="opacity-60">{s.size.toFixed(1)}px</span>
							</span>
							<span
								class="min-w-0 truncate"
								style={`font-family:${fontStack(t.headingFont)};font-size:${s.size}px;font-weight:${t.headingWeight};line-height:${t.headingLineHeight}`}
							>
								Design is how it works
							</span>
						</div>
					{/each}
					<div class="flex items-baseline gap-5 px-5 py-3">
						<span class="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
							Body<br /><span class="opacity-60">{t.baseSize}px</span>
						</span>
						<p
							class="min-w-0"
							style={`font-family:${fontStack(t.bodyFont)};font-size:${t.baseSize}px;font-weight:${t.bodyWeight};line-height:${t.bodyLineHeight}`}
						>
							Body text carries most of the interface. It should disappear into comfortable
							reading — legible at a glance, unremarkable on purpose.
						</p>
					</div>
				</div>
			</div>
		</section>

		<section class="mb-8">
			<div class={sectionHead}>Palette — {editing}</div>
			<div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
				{#each COLOR_TOKENS as tok (tok.key)}
					<div class="overflow-hidden rounded-[10px] border">
						<div class="h-14" style={`background:${palette[tok.key]}`}></div>
						<div class="bg-card px-2.5 py-2">
							<div class="truncate text-[11px] font-medium">{tok.label}</div>
							<div class="font-mono text-[10px] text-muted-foreground">{palette[tok.key]}</div>
						</div>
					</div>
				{/each}
			</div>

			<div class={card}>
				<div class="divide-y">
					{#each checks as c (c.label)}
						{@const ratio = contrast(c.fg, c.bg)}
						{@const g = grade(ratio)}
						<div class="flex items-center gap-4 px-5 py-2.5">
							<span
								class="grid h-8 w-11 shrink-0 place-items-center rounded-[7px] border text-[13px] font-semibold"
								style={`background:${c.bg};color:${c.fg}`}
							>
								Aa
							</span>
							<span class="min-w-0 flex-1 truncate text-[13px]">{c.label}</span>
							<span class="font-mono text-[12px] tabular-nums text-muted-foreground">
								{ratio.toFixed(2)}:1
							</span>
							<span
								class="w-20 shrink-0 rounded-[5px] px-2 py-0.5 text-center font-mono text-[10px] font-semibold"
								style={`background:color-mix(in srgb, ${
									g.pass === 'pass'
										? config.color.semantic.success
										: g.pass === 'large'
											? config.color.semantic.warning
											: config.color.semantic.danger
								} 16%, transparent);color:${
									g.pass === 'pass'
										? config.color.semantic.success
										: g.pass === 'large'
											? config.color.semantic.warning
											: config.color.semantic.danger
								}`}
							>
								{g.label}
							</span>
						</div>
					{/each}
				</div>
				<p class="border-t px-5 py-2.5 text-[11px] text-muted-foreground">
					WCAG 2.1 — AA needs 4.5:1 for body text, 3:1 for large text and UI components. AAA needs
					7:1.
				</p>
			</div>
		</section>

		<section class="mb-8">
			<div class={sectionHead}>Components</div>
			<div class={`${card} p-5`}>
				<div class="mb-5 flex flex-wrap items-center gap-2.5">
					<Button>Save changes</Button>
					<Button variant="secondary">Cancel</Button>
					<Button variant="outline">Preview</Button>
					<Button variant="ghost">View docs</Button>
					<Button variant="destructive">Delete</Button>
					<Button disabled>Saving…</Button>
				</div>
				<div class="mb-5 grid gap-4 sm:grid-cols-2">
					<div>
						<span class={label}>Project name</span>
						<input class={input} value="Base redesign" />
					</div>
					<div>
						<span class={label}>Status</span>
						<select class={input}>
							<option>Active</option>
							<option>Paused</option>
						</select>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each SEMANTIC as s (s.key)}
						<span
							class="rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-semibold capitalize"
							style={`background:color-mix(in srgb, ${config.color.semantic[s.key]} 15%, transparent);color:${config.color.semantic[s.key]}`}
						>
							{s.label}
						</span>
					{/each}
					<span class="rounded-[6px] bg-signal px-2 py-0.5 font-mono text-[11px] font-semibold text-signal-foreground">
						Signal
					</span>
					<span class="rounded-[6px] bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
						Neutral
					</span>
				</div>
			</div>
		</section>

		<section class="mb-8">
			<div class={sectionHead}>Derived variables — what your seven tokens produce</div>
			<div class={card}>
				<div class="max-h-80 overflow-auto">
					<table class="w-full text-[12px]">
						<tbody class="divide-y">
							{#each Object.entries(vars) as [name, value] (name)}
								<tr>
									<td class="w-8 py-1.5 pl-5">
										<span
											class="inline-block size-4 rounded-[4px] border align-middle"
											style={`background:var(${name})`}
										></span>
									</td>
									<td class="py-1.5 pr-4 font-mono">{name}</td>
									<td class="py-1.5 pr-5 text-right font-mono text-muted-foreground">{value}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="border-t px-5 py-2.5 text-[11px] text-muted-foreground">
					<code class="font-mono">--accent</code> is shadcn's subtle hover surface, not your brand
					colour — the accent you picked becomes
					<code class="font-mono">--signal</code>, <code class="font-mono">--ring</code> and the
					chart series.
				</p>
			</div>
		</section>

		<section>
			<div class={sectionHead}>Tokens — stored in Postgres, backed up with everything else</div>
			<div class={card}>
				<pre
					class="max-h-72 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-muted-foreground">{configJson}</pre>
			</div>
		</section>
	</div>
</div>

<style>
	/* The native range control paints its own track, which ignores the theme and
	   reads as a heavy black bar on paper. Drawing it from the tokens instead
	   keeps the instrument panel quiet in both modes. */
	input[type='range'] {
		appearance: none;
		-webkit-appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 999px;
		background: var(--muted);
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--signal);
		border: 2px solid var(--card);
	}
	input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--signal);
		border: 2px solid var(--card);
	}
	/* Colour wells come with chunky default chrome; strip it back to the swatch. */
	input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	input[type='color']::-webkit-color-swatch {
		border: none;
		border-radius: 4px;
	}
</style>
