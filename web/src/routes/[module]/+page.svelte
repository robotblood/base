<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import { getModule, MODULE_CODES } from '$lib/modules';
	import type { Column, Item } from '$lib/types';
	import {
		filterItems,
		groupItems,
		isDateField,
		readState,
		sortItems,
		viewsFor,
		writeState,
		type ViewState
	} from '$lib/views';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ModuleFields from '$lib/components/ModuleFields.svelte';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import SegmentedControl from '$lib/components/chrome/SegmentedControl.svelte';
	import SearchBox from '$lib/components/chrome/SearchBox.svelte';
	import { VIEW_META } from '$lib/components/chrome/viewMeta';
	import ViewToolbar from '$lib/components/views/ViewToolbar.svelte';
	import TableView from '$lib/components/views/TableView.svelte';
	import BoardView from '$lib/components/views/BoardView.svelte';
	import GroupedView from '$lib/components/views/GroupedView.svelte';
	import CalendarView from '$lib/components/views/CalendarView.svelte';
	import Plus from '@lucide/svelte/icons/plus';

	let { data }: { data: PageData } = $props();
	const mod = $derived(getModule(data.moduleKey)!);
	const code = $derived(MODULE_CODES[mod.key] ?? '');
	let createOpen = $state(false);

	const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

	// ---- view state: read from the URL, written back by navigating ----------
	const viewState = $derived(readState(page.url.searchParams, mod));
	const available = $derived(viewsFor(mod));
	const viewItems = $derived(
		available.map((v) => ({ value: v, label: VIEW_META[v].label, icon: VIEW_META[v].icon }))
	);

	function update(patch: Partial<ViewState>) {
		const next = { ...viewState, ...patch };
		goto(`/${mod.key}${writeState(next, mod, data.q)}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	// ---- column visibility: a preference, so localStorage rather than URL ----
	const storageKey = $derived(`base:cols:${mod.key}`);
	let hiddenCols = $state<string[]>([]);

	$effect(() => {
		// Re-read when the module changes; fall back to the config's defaults.
		const key = storageKey;
		const stored = localStorage.getItem(key);
		if (stored) {
			try {
				hiddenCols = JSON.parse(stored) as string[];
				return;
			} catch {
				/* corrupt entry — fall through to defaults */
			}
		}
		hiddenCols = mod.columns.filter((c) => c.hidden).map((c) => c.field);
	});

	const visibleColumns = $derived(mod.columns.filter((c) => !hiddenCols.includes(c.field)));

	function toggleColumn(field: string) {
		hiddenCols = hiddenCols.includes(field)
			? hiddenCols.filter((f) => f !== field)
			: [...hiddenCols, field];
		localStorage.setItem(storageKey, JSON.stringify(hiddenCols));
	}

	// ---- the derived record set --------------------------------------------
	// A search means "find it wherever it is" — completed/archived included.
	const effState = $derived(data.q ? { ...viewState, hideDone: false } : viewState);
	const filtered = $derived(filterItems(data.items as Item[], mod, effState));
	const sorted = $derived(sortItems(filtered, mod, viewState.sort, viewState.dir));

	// One clock for the whole render, so bucket boundaries can't shift mid-pass.
	const today = new Date();
	const groups = $derived(
		viewState.group ? groupItems(sorted, mod, viewState.group, today) : []
	);

	// A board needs a single-valued axis — you can't drag a record "into" one of
	// its tags. Fall back to the grouped view's rendering when the axis is a
	// tag or date field.
	const boardable = $derived(
		Boolean(
			viewState.group &&
				!isDateField(mod, viewState.group) &&
				mod.fields.find((f) => f.name === viewState.group)?.type !== 'tags'
		)
	);

	// Cards drop the field the section header already states — except for dates,
	// where the heading is a coarse bucket ("This week") and the exact day still
	// tells you something.
	const groupOmit = $derived(
		viewState.group && !isDateField(mod, viewState.group) ? [viewState.group] : []
	);

	const total = $derived((data.items as Item[]).length);
	const hiddenCount = $derived(total - filtered.length);

	// ---- board drag -> PATCH ------------------------------------------------
	// The `x-sveltekit-action` header asks for a serialised ActionResult rather
	// than a re-rendered page — without it a `fail()` comes back as a 200 and a
	// rejected move would look like a silent no-op.
	async function move(id: number, value: string | null) {
		const body = new FormData();
		body.set('id', String(id));
		body.set('field', viewState.group ?? '');
		body.set('value', value ?? '');
		let result: ActionResult;
		try {
			const res = await fetch(`/${mod.key}?/setField`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			result = deserialize(await res.text());
		} catch {
			toast.error('Could not reach the server');
			return;
		}
		if (result.type === 'failure') {
			toast.error(String(result.data?.message ?? 'Could not move that record'));
			return;
		}
		if (result.type === 'error') {
			toast.error('Could not move that record');
			return;
		}
		await invalidateAll();
	}

	const onCreate: SubmitFunction = () => async ({ result, update: applyForm }) => {
		if (result.type === 'success') {
			await applyForm();
			createOpen = false;
			toast.success(`${capitalize(mod.singular)} created`);
		} else if (result.type === 'failure') {
			toast.error(String(result.data?.message ?? 'Something went wrong'));
		} else if (result.type === 'error') {
			toast.error('Request failed');
		} else {
			await applyForm();
		}
	};
</script>

<svelte:head><title>base — {mod.label}</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		{code}
		title={mod.label}
		subtitle={`${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}${
			hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''
		}${data.q ? ` · “${data.q}”` : ''}`}
	>
		{#snippet actions()}
			{#if available.length > 1}
				<SegmentedControl
					items={viewItems}
					value={viewState.view}
					onchange={(v) => update({ view: v })}
					hideLabelsBelowSm
				/>
			{/if}
			<form method="GET" data-sveltekit-keepfocus>
				<SearchBox name="q" value={data.q} />
			</form>
			{#if mod.docField}
				<!-- Notion-style quick note: title, Enter, start writing. -->
				<form method="POST" action="?/quick" class="flex items-center">
					<input
						name="title"
						placeholder="Quick note — title, Enter…"
						autocomplete="off"
						class="w-[210px] rounded-[9px] border bg-card px-3 py-[9px] text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
					/>
				</form>
			{/if}
			<button
				onclick={() => (createOpen = true)}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] bg-primary px-[15px] py-[9px] text-[13px] font-semibold text-primary-foreground hover:opacity-90"
			>
				<Plus class="size-4" /> New
			</button>
		{/snippet}
	</PageHeader>

	<div class="mb-5">
		<ViewToolbar
			{mod}
			{viewState}
			items={data.items as Item[]}
			visible={visibleColumns}
			{update}
			{toggleColumn}
		/>
	</div>

	{#if data.apiError}
		<div
			class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			Could not reach the API: {data.apiError}
		</div>
	{/if}

	{#if viewState.view === 'table'}
		<TableView
			items={sorted}
			{mod}
			columns={visibleColumns}
			{viewState}
			{update}
			empty={data.apiError
				? 'No data.'
				: data.q || hiddenCount
					? 'No matches.'
					: 'Nothing here yet — add one.'}
		/>
	{:else if viewState.view === 'board' && boardable}
		<BoardView {groups} {mod} columns={visibleColumns} field={viewState.group!} onmove={move} />
	{:else if viewState.view === 'board' || viewState.view === 'group'}
		<GroupedView {groups} {mod} columns={visibleColumns} omit={groupOmit} />
	{:else if viewState.view === 'calendar'}
		<CalendarView
			items={sorted}
			{mod}
			columns={visibleColumns}
			month={viewState.month}
			setMonth={(m) => update({ month: m })}
		/>
	{/if}
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>New {mod.singular}</Dialog.Title>
			<Dialog.Description>Add a new record to {mod.label}.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/create" use:enhance={onCreate} class="py-2">
			<ModuleFields
				fields={mod.fields}
				relationOptions={data.relationOptions}
				tagSuggestions={data.tagSuggestions}
			/>
			<Dialog.Footer class="mt-5">
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
