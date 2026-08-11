<script lang="ts">
	// Create/edit form for one custom table: name, key, and the field list.
	// Fields serialize into a single hidden JSON input; the server action
	// forwards them to /tables where the real validation lives.
	import { enhance } from '$app/forms';
	import type { FieldSpec, FieldType } from '$lib/types';
	import type { CustomTableDef } from '$lib/modules';
	import { TABLE_TEMPLATES, type TableTemplate } from '$lib/tableTemplates';
	import X from '@lucide/svelte/icons/x';

	let {
		table = null,
		builtin = null,
		refTargets,
		oncancel
	}: {
		table?: CustomTableDef | null;
		// A built-in module instead of a custom table: code-defined fields render
		// fixed, extension fields (spec.ext) edit as usual, and the form saves
		// the extension list to the /fields registry via ?/updateModuleFields.
		builtin?: { key: string; label: string; fields: FieldSpec[] } | null;
		refTargets: { key: string; label: string }[];
		oncancel?: () => void;
	} = $props();

	const TYPES: { key: FieldType; label: string; hint: string }[] = [
		{ key: 'text', label: 'Text', hint: 'one line' },
		{ key: 'textarea', label: 'Long text', hint: 'markdown doc' },
		{ key: 'number', label: 'Number', hint: '' },
		{ key: 'date', label: 'Date', hint: '' },
		{ key: 'datetime', label: 'Date & time', hint: '' },
		{ key: 'select', label: 'Select', hint: 'one of a list' },
		{ key: 'checkbox', label: 'Checkbox', hint: '' },
		{ key: 'tags', label: 'Tags', hint: 'multi-label' },
		{ key: 'relation', label: 'Relation', hint: 'links a record' }
	];

	// Editor rows. Options edit as comma text; `locked` names are already data
	// keys (or the pinned title) and must not change; `fixed` rows (the pinned
	// title, a built-in's code-defined fields) don't edit at all.
	interface Draft {
		name: string | null; // null until created — slugged from label on save
		label: string;
		type: FieldType;
		optionsText: string;
		ref: string;
		required: boolean;
		locked: boolean;
		fixed: boolean;
	}
	const fromSpec = (f: FieldSpec): Draft => ({
		name: f.name,
		label: f.label,
		type: f.type,
		optionsText: (f.options ?? []).join(', '),
		ref: f.ref ?? '',
		required: !!f.required,
		locked: true,
		fixed: false
	});
	const fromCode = (f: FieldSpec): Draft => ({ ...fromSpec(f), fixed: true });
	// Template fields aren't data yet — leave name null so the server slugs
	// from the (still editable) label on save, same as hand-added fields.
	const fromTemplate = (f: FieldSpec): Draft => ({
		name: null,
		label: f.label,
		type: f.type,
		optionsText: (f.options ?? []).join(', '),
		ref: f.ref ?? (refTargets[0]?.key ?? ''),
		required: !!f.required,
		locked: false,
		fixed: false
	});
	const TITLE_ROW: Draft = {
		name: 'title',
		label: 'Title',
		type: 'text',
		optionsText: '',
		ref: '',
		required: true,
		locked: true,
		fixed: true
	};

	let name = $state(table?.name ?? '');
	let key = $state(table?.key ?? '');
	let keyTouched = $state(!!table);
	let drafts = $state<Draft[]>(
		builtin
			? [
					...builtin.fields.filter((f) => !f.ext).map(fromCode),
					...builtin.fields.filter((f) => f.ext).map(fromSpec)
				]
			: table
				? [
						...table.fields.filter((f) => f.name === 'title').map(fromCode),
						...table.fields.filter((f) => f.name !== 'title').map(fromSpec)
					]
				: [TITLE_ROW]
	);
	let message = $state('');
	let busy = $state(false);
	let activeTemplate = $state<string | null>(null);

	// Field names that are data right now — so removing one can say, visibly,
	// what actually happens to its values (kept, not destroyed).
	const originalNames = (
		builtin ? builtin.fields.filter((f) => f.ext) : (table?.fields ?? [])
	).map((f) => f.name);
	const removed = $derived(
		originalNames.filter((n) => n !== 'title' && !drafts.some((d) => d.name === n))
	);

	const slug = (s: string, sep: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, sep)
			.replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '')
			.slice(0, 40);

	function onNameInput() {
		if (!keyTouched) key = slug(name, '-');
	}
	// Swap the non-title rows for the template's fields. Rows stay fully
	// editable afterward, so a template is a starting point, not a mode.
	function applyTemplate(tpl: TableTemplate) {
		drafts = [drafts[0], ...tpl.fields.map(fromTemplate)];
		activeTemplate = tpl.key;
		if (!name.trim()) {
			name = tpl.name;
			if (!keyTouched) key = slug(tpl.name, '-');
		}
	}
	// Palette adds a field already set to the picked type — no dropdown detour.
	function addField(type: FieldType = 'text') {
		drafts.push({
			name: null,
			label: '',
			type,
			optionsText: type === 'select' ? 'Option A, Option B' : '',
			ref: refTargets[0]?.key ?? '',
			required: false,
			locked: false,
			fixed: false
		});
	}
	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		// Fixed rows (pinned title, built-in fields) hold the head of the list.
		if (j < 0 || j >= drafts.length || drafts[i].fixed || drafts[j].fixed) return;
		[drafts[i], drafts[j]] = [drafts[j], drafts[i]];
	}

	// ---- live preview: mirror synthesizeModule() so what you see here is
	// what the module page will actually do with this field list.
	const previewCols = $derived(drafts.filter((d) => d.label.trim() && d.type !== 'textarea'));
	const previewViews = $derived.by(() => {
		const named = drafts.filter((d) => d.label.trim());
		const v: string[] = ['table'];
		if (named.some((d) => d.type === 'select')) v.push('board', 'group');
		if (named.some((d) => d.type === 'date' || d.type === 'datetime')) v.push('calendar');
		return v;
	});

	const serialized = $derived(
		JSON.stringify(
			drafts
				// A built-in's code fields live in code — only the added rows travel.
				// A custom table's pinned title is real data and must serialize.
				.filter((d) => !(builtin && d.fixed))
				.filter((d) => d.label.trim())
				.map((d): FieldSpec => {
					const fieldName = d.name ?? (slug(d.label, '_') || 'field');
					return {
						name: fieldName,
						label: d.label.trim(),
						type: d.type,
						...(d.type === 'select'
							? {
									options: d.optionsText
										.split(',')
										.map((s) => s.trim())
										.filter(Boolean)
								}
							: {}),
						...(d.type === 'relation' && d.ref ? { ref: d.ref } : {}),
						...(d.required ? { required: true } : {})
					};
				})
		)
	);

	const input =
		'rounded-[7px] border bg-card px-2.5 py-[7px] text-[13px] outline-none focus:border-ring';
	const smallBtn =
		'cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80 disabled:opacity-40';
	const chip =
		'cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.04em] text-muted-foreground hover:border-ring/50 hover:text-foreground/80';
</script>

<form
	method="POST"
	action={builtin ? '?/updateModuleFields' : table ? '?/updateTable' : '?/createTable'}
	use:enhance={() => {
		busy = true;
		message = '';
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') message = String(result.data?.message ?? 'Failed');
			else {
				await update();
				oncancel?.();
			}
		};
	}}
	class="border-t px-5 py-4"
>
	{#if builtin}<input type="hidden" name="module" value={builtin.key} />{/if}
	{#if table}<input type="hidden" name="id" value={table.id} />{/if}
	<input type="hidden" name="fields" value={serialized} />

	{#if !table && !builtin}
		<!-- Template chips: new tables only — replaces the field rows, keeps title. -->
		<div class="mb-3 flex flex-wrap items-center gap-1.5">
			<span class="mr-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
				>Start from</span
			>
			{#each TABLE_TEMPLATES as tpl (tpl.key)}
				<button
					type="button"
					onclick={() => applyTemplate(tpl)}
					title={tpl.hint}
					class="{chip} {activeTemplate === tpl.key ? 'border-ring/60 text-foreground/90' : ''}"
					>{tpl.name}</button
				>
			{/each}
			<button
				type="button"
				onclick={() => {
					drafts = [drafts[0]];
					activeTemplate = null;
				}}
				class={chip}>Blank</button
			>
		</div>
	{/if}

	{#if builtin}
		<div class="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
			{builtin.label} — built-in fields are set in code; rows you add are yours to change.
		</div>
	{:else}
	<div class="mb-3 flex flex-wrap items-center gap-2">
		<input
			bind:value={name}
			oninput={onNameInput}
			name="name"
			placeholder="Table name — e.g. Documents"
			required
			class="{input} min-w-[200px] flex-1 font-semibold"
		/>
		<label class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			/
			<input
				bind:value={key}
				oninput={() => (keyTouched = true)}
				name="key"
				placeholder="url-key"
				required
				disabled={!!table}
				pattern="[a-z][a-z0-9\-]+"
				title="lowercase letters, digits, dashes"
				class="{input} w-[140px] font-mono text-[12px] disabled:opacity-60"
			/>
		</label>
	</div>
	{/if}

	<div class="mb-1 grid grid-cols-[1fr_130px_1fr_90px_60px] gap-2 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
		<span>Field</span><span>Type</span><span>Options / target</span><span>Required</span><span></span>
	</div>
	{#each drafts as d, i (i)}
		<div class="grid grid-cols-[1fr_130px_1fr_90px_60px] items-center gap-2 border-t py-1.5">
			<input
				bind:value={d.label}
				placeholder="Field label"
				disabled={d.fixed}
				class="{input} py-[5px] disabled:opacity-70"
			/>
			<select bind:value={d.type} disabled={d.locked} class="{input} py-[5px] text-[12px] disabled:opacity-60">
				{#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
			</select>
			<div class="min-w-0">
				{#if d.fixed}
					<span class="block truncate font-mono text-[10px] text-muted-foreground/60">
						{d.type === 'select' ? d.optionsText : d.type === 'relation' ? `→ ${d.ref}` : TYPES.find((t) => t.key === d.type)?.hint}
					</span>
				{:else if d.type === 'select'}
					<input
						bind:value={d.optionsText}
						placeholder="Option A, Option B, …"
						class="{input} w-full py-[5px] font-mono text-[12px]"
					/>
				{:else if d.type === 'relation'}
					<select bind:value={d.ref} class="{input} w-full py-[5px] text-[12px]">
						{#each refTargets as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				{:else}
					<span class="font-mono text-[10px] text-muted-foreground/60"
						>{TYPES.find((t) => t.key === d.type)?.hint}</span
					>
				{/if}
			</div>
			<input type="checkbox" bind:checked={d.required} disabled={d.fixed} class="justify-self-start" />
			<div class="flex gap-1 justify-self-end">
				{#if !d.fixed}
					<button type="button" onclick={() => move(i, -1)} disabled={i === 0 || drafts[i - 1].fixed} class={smallBtn}>↑</button>
					<button type="button" onclick={() => move(i, 1)} disabled={i === drafts.length - 1} class={smallBtn}>↓</button>
					<button
						type="button"
						onclick={() => drafts.splice(i, 1)}
						title="Remove field{d.locked
							? ' — values are kept; restore or purge them from Admin → Archive'
							: ''}"
						class="cursor-pointer text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button
					>
				{:else}
					<span class="font-mono text-[9px] uppercase text-muted-foreground/60"
						>{builtin ? 'built-in' : 'pinned'}</span
					>
				{/if}
			</div>
		</div>
	{/each}

	<!-- Field palette: one tap adds a row already set to that type. -->
	<div class="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
		<span class="mr-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
			>Add</span
		>
		{#each TYPES as t (t.key)}
			<button type="button" onclick={() => addField(t.key)} class={chip}>+ {t.label}</button>
		{/each}
	</div>

	<!-- Live preview: the columns and views this field list will produce,
	     mirroring synthesizeModule() so there are no surprises after save. -->
	{#if previewCols.length}
		<div class="mt-3 overflow-hidden rounded-[8px] border">
			<div class="flex items-center gap-2 border-b bg-accent/40 px-3 py-1.5">
				<span class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
					>Preview</span
				>
				<span class="font-mono text-[10px] text-muted-foreground">
					views: {previewViews.join(' · ')}
				</span>
			</div>
			<div class="flex gap-4 overflow-x-auto px-3 py-2">
				{#each previewCols as c, i (i)}
					<span class="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.06em] {c.required ? 'text-foreground/80' : 'text-muted-foreground'}">
						{c.label.trim()}{c.type === 'select' || c.type === 'tags' ? ' ◈' : ''}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	{#if removed.length}
		<p class="mt-3 rounded-[8px] border border-ring/30 bg-accent/40 px-3 py-2 text-[12px] text-muted-foreground">
			Removing <span class="font-mono">{removed.join(', ')}</span> — values in existing rows
			are kept, just hidden. After saving, restore or purge them under
			<a href="/admin/archive" class="underline decoration-dotted underline-offset-2">Admin → Archive</a>.
		</p>
	{/if}

	<div class="mt-3 flex items-center gap-2">
		<span class="flex-1"></span>
		{#if message}<span class="text-[12px] text-destructive">{message}</span>{/if}
		{#if oncancel}
			<button type="button" onclick={oncancel} class={smallBtn}>CANCEL</button>
		{/if}
		<button
			type="submit"
			disabled={busy || (!builtin && (!name.trim() || !key.trim()))}
			class="cursor-pointer rounded-[7px] bg-primary px-3.5 py-[7px] text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40"
		>
			{busy ? 'Saving…' : table || builtin ? 'Save fields' : 'Create table'}
		</button>
	</div>
</form>
