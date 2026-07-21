<script lang="ts">
	// Renders the labeled form controls for a module, from its field specs.
	// Shared by the create dialog (list) and the edit form (detail record).
	import type { FieldSpec, FieldType, RelationOption } from '$lib/types';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import DateField from '$lib/components/DateField.svelte';
	import DateTimeField from '$lib/components/DateTimeField.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';

	let {
		fields,
		item = null,
		relationOptions = {},
		tagSuggestions = []
	}: {
		fields: FieldSpec[];
		item?: Record<string, unknown> | null;
		relationOptions?: Record<string, RelationOption[]>;
		tagSuggestions?: string[];
	} = $props();

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

<div class="grid gap-4">
	{#each fields as f (f.name)}
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
		{:else}
			<div class="grid gap-1.5">
				<Label
					for={f.name}
					class="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
				>
					{f.label}{#if f.required}<span class="text-signal"> *</span>{/if}
				</Label>
				{#if f.type === 'textarea'}
					<Textarea id={f.name} name={f.name} value={scalarValue(f, value)} rows={4} />
				{:else if f.type === 'select'}
					<select id={f.name} name={f.name} class={selectCls}>
						<option value="" selected={value === null || value === undefined || value === ''}>—</option>
						{#each f.options ?? [] as opt (opt)}
							<option value={opt} selected={String(value) === opt}>{opt}</option>
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
					<TagPicker name={f.name} {value} suggestions={tagSuggestions} />
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
