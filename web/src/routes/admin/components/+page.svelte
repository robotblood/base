<script lang="ts">
	// The component gallery: every shared piece the app is assembled from,
	// rendered live next to its file path — a map of what already exists, so
	// new screens (or a new instance owner) reach for a primitive instead of
	// rebuilding one. Demos are real components with local state; the module
	// vocabularies section reads the live registry, so a /settings/modules
	// override shows up here on refresh like everywhere else.
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import SearchBox from '$lib/components/chrome/SearchBox.svelte';
	import SegmentedControl from '$lib/components/chrome/SegmentedControl.svelte';
	import StatusDot from '$lib/components/chrome/StatusDot.svelte';
	import { VIEW_META } from '$lib/components/chrome/viewMeta';
	import DateField from '$lib/components/DateField.svelte';
	import DateTimeField from '$lib/components/DateTimeField.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { MODULES, MODULE_CODES } from '$lib/modules';
	import { STATE } from '$lib/status';
	import type { ViewKind } from '$lib/types';
	import Plus from '@lucide/svelte/icons/plus';

	let view = $state<ViewKind>('table');
	let query = $state('');

	const viewItems = (Object.keys(VIEW_META) as ViewKind[]).map((v) => ({
		value: v,
		label: VIEW_META[v].label,
		icon: VIEW_META[v].icon
	}));

	// Built-ins with a colour vocabulary — what StatusDot renders from.
	const colored = MODULES.filter((m) => !m.custom && m.statusColors);

	// The composed components too big to demo in a box: where they live and a
	// real page that exercises them.
	const INVENTORY: { name: string; path: string; what: string; href?: string; at?: string }[] = [
		{ name: 'TableView', path: 'components/views', what: 'The module list table: sortable columns, badge/tags renderers, column picker.', href: '/todos', at: '/todos' },
		{ name: 'BoardView', path: 'components/views', what: 'Status columns as tinted panels; drag a card to move it between values.', href: '/todos?view=board', at: '/todos?view=board' },
		{ name: 'GroupedView', path: 'components/views', what: 'Rows bucketed by any group field, done sinking to a trailing group.', href: '/todos?view=group', at: '/todos?view=group' },
		{ name: 'CalendarView', path: 'components/views', what: 'Month grid over the module’s date field.', href: '/events?view=calendar', at: '/events?view=calendar' },
		{ name: 'RecordCard', path: 'components/views', what: 'The card the board and grouped views deal in.', href: '/todos?view=board', at: 'board + grouped' },
		{ name: 'ViewToolbar', path: 'components/views', what: 'Sort / group / filter / hide-done controls; state lives in the URL so a slice is shareable.', href: '/todos', at: 'every list page' },
		{ name: 'ModuleFields', path: 'components', what: 'The whole add/edit form, generated from a module’s `fields` registry entry.', href: '/todos', at: 'create dialog + record pages' },
		{ name: 'MarkdownDoc / MarkdownField', path: 'components', what: 'Document body renderer and its Write/Preview editor.', href: '/notes', at: 'notes + incidents' },
		{ name: 'NoteEditor', path: 'components/editor', what: 'The rich editor: slash commands, headings, tables, buttons.', href: '/notes', at: 'note record pages' },
		{ name: 'TagPicker', path: 'components', what: 'Tag input backed by /tags, so existing vocabulary gets reused instead of retyped.', at: 'every form with tags' },
		{ name: 'CommandPalette', path: 'components/chrome', what: 'The global jump-anywhere overlay, registered once in the root layout.', at: 'everywhere' },
		{ name: 'ProjectsListView / ProjectDetailView / ProjectRundown', path: 'components/projects', what: 'The Projects tracker suite: stages, media previews, file gallery, shows.', href: '/projects', at: '/projects' }
	];
</script>

{#snippet demo(name: string, path: string, note: string)}
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 border-b px-5 py-3">
		<span class="text-[13px] font-bold">{name}</span>
		<code class="font-mono text-[11px] text-muted-foreground">src/lib/{path}</code>
	</div>
	{#if note}
		<p class="px-5 pt-3 text-[12px] leading-relaxed text-muted-foreground">{note}</p>
	{/if}
{/snippet}

<div class="px-9 pb-16 pt-7">
	<PageHeader
		code="ADMIN"
		title="Components"
		subtitle="the shared pieces every screen is assembled from — live, with where they live"
	/>

	<!-- ——— chrome ——— -->
	<h2 class="mb-3 mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
		Chrome — the page furniture
	</h2>
	<div class="grid gap-4 lg:grid-cols-2">
		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'PageHeader',
				'components/chrome/PageHeader.svelte',
				'Patchbay code, 31px extra-bold title, mono subtitle, right-hand actions. The masthead at the top of this page is the real thing; here it is again with an action slotted in:'
			)}
			<div class="p-5">
				<PageHeader code="DEMO" title="A module page" subtitle="14 records · 2 overdue">
					{#snippet actions()}
						<Button size="sm"><Plus class="size-3.5" /> New record</Button>
					{/snippet}
				</PageHeader>
			</div>
		</div>

		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'SegmentedControl',
				'components/chrome/SegmentedControl.svelte',
				'The filled view switcher. Generic over its values; icons optional. This one is wired to local state — click it:'
			)}
			<div class="flex flex-wrap items-center gap-4 p-5">
				<SegmentedControl items={viewItems} value={view} onchange={(v) => (view = v)} />
				<span class="font-mono text-[12px] text-muted-foreground">value = "{view}"</span>
			</div>
		</div>

		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'SearchBox',
				'components/chrome/SearchBox.svelte',
				'Bordered search field; works controlled (client filtering) or inside a GET form (server-side q):'
			)}
			<div class="flex flex-wrap items-center gap-4 p-5">
				<SearchBox value={query} oninput={(v) => (query = v)} placeholder="Try typing…" />
				{#if query}<span class="font-mono text-[12px] text-muted-foreground">q = "{query}"</span>{/if}
			</div>
		</div>

		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'StatusDot',
				'components/chrome/StatusDot.svelte',
				'A semantic state dot for a module’s status value. Renders nothing when the value has no colour, so free-text vocabularies degrade to plain text:'
			)}
			<div class="flex flex-wrap items-center gap-x-5 gap-y-2 p-5">
				{#each colored.slice(0, 1) as m (m.key)}
					{#each Object.keys(m.statusColors ?? {}) as value (value)}
						<StatusDot mod={m} {value} showLabel />
					{/each}
				{/each}
			</div>
		</div>
	</div>

	<!-- ——— palette ——— -->
	<h2 class="mb-3 mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
		Status palette — $lib/status.ts
	</h2>
	<div class="rounded-[12px] border bg-card p-5">
		<div class="flex flex-wrap gap-x-8 gap-y-3">
			{#each Object.entries(STATE) as [name, hex] (name)}
				<span class="inline-flex items-center gap-2.5">
					<span class="size-4 rounded-full" style="background:{hex}"></span>
					<span class="text-[13px] font-semibold">{name}</span>
					<code class="font-mono text-[11px] text-muted-foreground">{hex}</code>
				</span>
			{/each}
		</div>
		<p class="mt-4 text-[12px] leading-relaxed text-muted-foreground">
			Fixed hex on purpose — these encode meaning, which must not invert between light and dark.
			The served registry (<code class="font-mono">GET /modules</code>) refers to these by name
			(“progress”, “done”), so a customized instance recolours by vocabulary, not by hex.
		</p>
	</div>

	<!-- ——— module vocabularies ——— -->
	<h2 class="mb-3 mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
		Module vocabularies — the registry, rendered
	</h2>
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each colored as m (m.key)}
			<div class="rounded-[12px] border bg-card px-5 py-4">
				<div class="flex items-baseline justify-between">
					<span class="text-[13px] font-bold">{m.label}</span>
					<code class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground"
						>{MODULE_CODES[m.key]}</code
					>
				</div>
				<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
					{#each Object.keys(m.statusColors ?? {}) as value (value)}
						<StatusDot mod={m} {value} showLabel />
					{/each}
				</div>
			</div>
		{/each}
	</div>
	<p class="mt-3 text-[12px] text-muted-foreground">
		This section reads the live module registry — override a module in
		<code class="font-mono">/settings/modules</code> and it changes here on refresh.
	</p>

	<!-- ——— form + ui primitives ——— -->
	<h2 class="mb-3 mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
		Fields &amp; primitives
	</h2>
	<div class="grid gap-4 lg:grid-cols-2">
		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'DateField / DateTimeField',
				'components/DateField.svelte',
				'Calendar-popover pickers that submit like native inputs (a hidden field carries the ISO value into the form action):'
			)}
			<div class="flex flex-wrap items-center gap-4 p-5">
				<DateField name="demo_date" />
				<DateTimeField name="demo_at" />
			</div>
		</div>

		<div class="rounded-[12px] border bg-card">
			{@render demo(
				'Button / Badge / Input / Checkbox',
				'components/ui (shadcn-svelte)',
				'The stock primitives underneath everything, restyled by the design tokens (Admin → Design):'
			)}
			<div class="flex flex-wrap items-center gap-3 p-5">
				<Button size="sm">Primary</Button>
				<Button size="sm" variant="secondary">Secondary</Button>
				<Button size="sm" variant="outline">Outline</Button>
				<Button size="sm" variant="destructive">Destructive</Button>
				<Badge>badge</Badge>
				<Badge variant="secondary">secondary</Badge>
				<Badge variant="outline">outline</Badge>
				<div class="flex items-center gap-2">
					<Checkbox id="kit-check" checked />
					<label for="kit-check" class="text-[13px]">Checkbox</label>
				</div>
				<Input class="w-[180px]" placeholder="Input" />
			</div>
		</div>
	</div>

	<!-- ——— the big composed pieces ——— -->
	<h2 class="mb-3 mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
		Composed views — too big for a box, linked where they run
	</h2>
	<div class="overflow-x-auto rounded-[12px] border bg-card">
		<table class="w-full text-[13px]">
			<thead>
				<tr class="border-b text-left">
					<th class="px-5 py-3 font-semibold">Component</th>
					<th class="px-5 py-3 font-semibold">Lives in</th>
					<th class="w-full px-5 py-3 font-semibold">What it does</th>
					<th class="px-5 py-3 font-semibold">See it</th>
				</tr>
			</thead>
			<tbody>
				{#each INVENTORY as c (c.name)}
					<tr class="border-b last:border-b-0">
						<td class="whitespace-nowrap px-5 py-3 font-semibold">{c.name}</td>
						<td class="whitespace-nowrap px-5 py-3"
							><code class="font-mono text-[11px] text-muted-foreground">src/lib/{c.path}</code></td
						>
						<td class="w-full px-5 py-3 text-foreground/80">{c.what}</td>
						<td class="whitespace-nowrap px-5 py-3">
							{#if c.href}
								<a class="font-medium text-signal hover:underline" href={c.href}>{c.at}</a>
							{:else}
								<span class="text-muted-foreground">{c.at}</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-6 text-[12px] leading-relaxed text-muted-foreground">
		Everything on this page is a Svelte component today. If the frontend ever moves to Rust
		(Leptos/Dioxus), this gallery is the porting checklist — same components, same registry
		underneath.
	</p>
</div>
