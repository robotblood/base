<script lang="ts">
	// Renders the labeled form controls for a module, from its field specs.
	// Shared by the create dialog (list) and the edit form (detail record).
	import type { FieldSpec, FieldType, RelationOption } from '$lib/types';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import DateTimeField from '$lib/components/DateTimeField.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';

	let {
		fields,
		item = null,
		relationOptions = {},
		tagSuggestions = [],
		suggestionsByField = {},
		exclude = [],
		layout = 'stack'
	}: {
		fields: FieldSpec[];
		item?: Record<string, unknown> | null;
		relationOptions?: Record<string, RelationOption[]>;
		tagSuggestions?: string[];
		// Per-field override of the tag-picker suggestion pool (e.g. attendees
		// suggest People, not the shared tag vocabulary).
		suggestionsByField?: Record<string, string[]>;
		exclude?: string[]; // fields rendered elsewhere (e.g. the doc editor)
		layout?: 'stack' | 'row'; // 'row' packs fields side by side (header strips)
	} = $props();

	const shown = $derived(fields.filter((f) => !exclude.includes(f.name)));

	// Explicit fg/bg + `color-scheme` (set globally) keep the native dropdown and
	// its option list readable — the popover-blue-on-white default was unreadable.
	const selectCls =
		'border-input text-foreground bg-background h-8 w-full rounded-lg border px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-popover [&_option]:text-popover-foreground';

	function scalarValue(f: FieldSpec, value: unknown): string {
		if (value === null || value === undefined) return '';
		if (f.type === 'tags') return Array.isArray(value) ? value.join(', ') : String(value);
		return String(value);
	}
	const asType = (t: FieldType) => (t === 'number' ? 'number' : 'text');

</script>

{#snippet fieldLabel(f: FieldSpec)}
	<Label for={f.name} class="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
		{f.label}{#if f.required}<span class="text-signal"> *</span>{/if}
	</Label>
{/snippet}

<div class={layout === 'row' ? 'flex flex-wrap items-end gap-x-5 gap-y-3' : 'grid gap-4'}>
	{#each shown as f (f.name)}
		{@const value = item ? item[f.name] : undefined}
		{#if f.type === 'checkbox'}
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name={f.name}
					value="true"
					checked={Boolean(value)}
					class="size-4 rounded border-input accent-signal"
				/>
				{f.label}
			</label>
		{:else if f.type === 'textarea'}
			<!-- Every long-text field edits like a note: the block editor with the
			     "/" menu and a raw-markdown tab — one behavior everywhere. -->
			<div class={layout === 'row' ? 'grid min-w-[170px] flex-1 gap-1.5' : 'grid gap-1.5'}>
				<!-- The label rides into the editor's own toolbar so it shares a row
				     with the Doc/Markdown toggle, the way every other field's label
				     shares one with its control. -->
				<MarkdownField
					name={f.name}
					value={scalarValue(f, value)}
					placeholder={f.placeholder}
					compact
				>
					{#snippet header()}{@render fieldLabel(f)}{/snippet}
				</MarkdownField>
			</div>
		{:else}
			<div class={layout === 'row' ? 'grid min-w-[170px] max-w-[260px] flex-1 gap-1.5' : 'grid gap-1.5'}>
				<div class="flex items-center justify-between">
					{@render fieldLabel(f)}
				</div>
				{#if f.type === 'select'}
					{@const cur = value == null ? '' : String(value)}
					<select id={f.name} name={f.name} class={selectCls}>
						<option value="" selected={cur === ''}>—</option>
						<!-- A stored value outside the current vocabulary (imported data is
						     kept unmigrated) stays selectable so editing never drops it. -->
						{#if cur !== '' && !(f.options ?? []).includes(cur)}
							<option value={cur} selected>{cur}</option>
						{/if}
						{#each f.options ?? [] as opt (opt)}
							<option value={opt} selected={cur === opt}>{opt}</option>
						{/each}
					</select>
				{:else if f.type === 'relation'}
					<select id={f.name} name={f.name} class={selectCls}>
						<option value="" selected={value === null || value === undefined || value === ''}>
							— None —
						</option>
						{#each relationOptions[f.ref ?? ''] ?? [] as opt (opt.id)}
							<option value={opt.id} selected={String(value) === String(opt.id)}>{opt.label}</option>
						{/each}
					</select>
				{:else if f.type === 'date'}
					<DateField id={f.name} name={f.name} value={value != null ? String(value) : undefined} />
				{:else if f.type === 'datetime'}
					<DateTimeField id={f.name} name={f.name} value={value != null ? String(value) : undefined} />
				{:else if f.type === 'tags'}
					<TagPicker name={f.name} {value} suggestions={suggestionsByField[f.name] ?? tagSuggestions} />
				{:else}
					<Input
						id={f.name}
						name={f.name}
						type={asType(f.type)}
						value={scalarValue(f, value)}
						required={f.required}
					/>
				{/if}
			</div>
		{/if}
	{/each}
</div>
