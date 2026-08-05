<script lang="ts">
	// Create/edit form for one custom table: name, key, and the field list.
	// Fields serialize into a single hidden JSON input; the server action
	// forwards them to /tables where the real validation lives.
	import { enhance } from '$app/forms';
	import type { FieldSpec, FieldType } from '$lib/types';
	import type { CustomTableDef } from '$lib/modules';
	import X from '@lucide/svelte/icons/x';

	let {
		table = null,
		refTargets,
		oncancel
	}: {
		table?: CustomTableDef | null;
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
	// keys (or the pinned title) and must not change.
	interface Draft {
		name: string | null; // null until created — slugged from label on save
		label: string;
		type: FieldType;
		optionsText: string;
		ref: string;
		required: boolean;
		rich: boolean;
		locked: boolean;
	}
	const fromSpec = (f: FieldSpec): Draft => ({
		name: f.name,
		label: f.label,
		type: f.type,
		optionsText: (f.options ?? []).join(', '),
		ref: f.ref ?? '',
		required: !!f.required,
		rich: !!f.rich,
		locked: true
	});
	const TITLE_ROW: Draft = {
		name: 'title',
		label: 'Title',
		type: 'text',
		optionsText: '',
		ref: '',
		required: true,
		rich: false,
		locked: true
	};

	let name = $state(table?.name ?? '');
	let key = $state(table?.key ?? '');
	let keyTouched = $state(!!table);
	let drafts = $state<Draft[]>(
		table
			? [
					...table.fields.filter((f) => f.name === 'title').map(fromSpec),
					...table.fields.filter((f) => f.name !== 'title').map(fromSpec)
				]
			: [TITLE_ROW]
	);
	let message = $state('');
	let busy = $state(false);

	const slug = (s: string, sep: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, sep)
			.replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '')
			.slice(0, 40);

	function onNameInput() {
		if (!keyTouched) key = slug(name, '-');
	}
	function addField() {
		drafts.push({
			name: null,
			label: '',
			type: 'text',
			optionsText: '',
			ref: refTargets[0]?.key ?? '',
			required: false,
			rich: false,
			locked: false
		});
	}
	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 1 || j >= drafts.length || i < 1) return; // title stays first
		[drafts[i], drafts[j]] = [drafts[j], drafts[i]];
	}

	const serialized = $derived(
		JSON.stringify(
			drafts
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
						...(d.required ? { required: true } : {}),
						...(d.type === 'textarea' && d.rich ? { rich: true } : {})
					};
				})
		)
	);

	const input =
		'rounded-[7px] border bg-card px-2.5 py-[7px] text-[13px] outline-none focus:border-ring';
	const smallBtn =
		'cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80 disabled:opacity-40';
</script>

<form
	method="POST"
	action={table ? '?/updateTable' : '?/createTable'}
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
	{#if table}<input type="hidden" name="id" value={table.id} />{/if}
	<input type="hidden" name="fields" value={serialized} />

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

	<div class="mb-1 grid grid-cols-[1fr_130px_1fr_90px_60px] gap-2 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
		<span>Field</span><span>Type</span><span>Options / target</span><span>Required</span><span></span>
	</div>
	{#each drafts as d, i (i)}
		<div class="grid grid-cols-[1fr_130px_1fr_90px_60px] items-center gap-2 border-t py-1.5">
			<input
				bind:value={d.label}
				placeholder="Field label"
				disabled={i === 0}
				class="{input} py-[5px] disabled:opacity-70"
			/>
			<select bind:value={d.type} disabled={d.locked} class="{input} py-[5px] text-[12px] disabled:opacity-60">
				{#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
			</select>
			<div class="min-w-0">
				{#if d.type === 'select'}
					<input
						bind:value={d.optionsText}
						placeholder="Option A, Option B, …"
						class="{input} w-full py-[5px] font-mono text-[12px]"
					/>
				{:else if d.type === 'relation'}
					<select bind:value={d.ref} class="{input} w-full py-[5px] text-[12px]">
						{#each refTargets as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				{:else if d.type === 'textarea'}
					<label class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
						<input type="checkbox" bind:checked={d.rich} /> block editor
					</label>
				{:else}
					<span class="font-mono text-[10px] text-muted-foreground/60"
						>{TYPES.find((t) => t.key === d.type)?.hint}</span
					>
				{/if}
			</div>
			<input type="checkbox" bind:checked={d.required} disabled={i === 0} class="justify-self-start" />
			<div class="flex gap-1 justify-self-end">
				{#if i > 0}
					<button type="button" onclick={() => move(i, -1)} disabled={i === 1} class={smallBtn}>↑</button>
					<button type="button" onclick={() => move(i, 1)} disabled={i === drafts.length - 1} class={smallBtn}>↓</button>
					<button
						type="button"
						onclick={() => drafts.splice(i, 1)}
						title="Remove field{d.locked ? ' (existing rows keep their value, unshown)' : ''}"
						class="cursor-pointer text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button
					>
				{:else}
					<span class="font-mono text-[9px] uppercase text-muted-foreground/60">pinned</span>
				{/if}
			</div>
		</div>
	{/each}

	<div class="mt-3 flex items-center gap-2">
		<button type="button" onclick={addField} class={smallBtn}>+ ADD FIELD</button>
		<span class="flex-1"></span>
		{#if message}<span class="text-[12px] text-destructive">{message}</span>{/if}
		{#if oncancel}
			<button type="button" onclick={oncancel} class={smallBtn}>CANCEL</button>
		{/if}
		<button
			type="submit"
			disabled={busy || !name.trim() || !key.trim()}
			class="cursor-pointer rounded-[7px] bg-primary px-3.5 py-[7px] text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40"
		>
			{busy ? 'Saving…' : table ? 'Save fields' : 'Create table'}
		</button>
	</div>
</form>
