<script lang="ts">
	// Inline schema editing for custom tables, straight from the table header:
	// no spec = the "+" column (add a field), spec = the pencil on a column
	// (edit label/options/required, or remove). Posts to the module page's
	// saveField/removeField actions; success re-registers the module, so the
	// new column simply appears. Type is locked once a field exists — rows
	// already hold values of that shape.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as Popover from '$lib/components/ui/popover';
	import { MODULES } from '$lib/modules';
	import type { FieldSpec, FieldType } from '$lib/types';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';

	let { spec = null }: { spec?: FieldSpec | null } = $props();

	const TYPES: { key: FieldType; label: string }[] = [
		{ key: 'text', label: 'Text' },
		{ key: 'textarea', label: 'Long text' },
		{ key: 'number', label: 'Number' },
		{ key: 'date', label: 'Date' },
		{ key: 'datetime', label: 'Date & time' },
		{ key: 'select', label: 'Select' },
		{ key: 'checkbox', label: 'Checkbox' },
		{ key: 'tags', label: 'Tags' },
		{ key: 'relation', label: 'Relation' }
	];

	// Relations may point at any visible built-in module — same offer as the
	// admin builder. MODULES is registered by the layout load before render.
	const refTargets = MODULES.filter((m) => !m.hidden && !m.custom);

	let open = $state(false);
	let label = $state('');
	let type = $state<FieldType>('text');
	let optionsText = $state('');
	let ref = $state('');
	let required = $state(false);
	let confirmRemove = $state(false);
	let busy = $state(false);

	// Re-seed the drafts on every open, so a cancelled edit leaves no residue.
	$effect(() => {
		if (!open) return;
		label = spec?.label ?? '';
		type = spec?.type ?? 'text';
		optionsText = (spec?.options ?? []).join(', ');
		ref = spec?.ref ?? refTargets[0]?.key ?? '';
		required = !!spec?.required;
		confirmRemove = false;
	});

	const onResult =
		(done: string): SubmitFunction =>
		() => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'failure') toast.error(String(result.data?.message ?? 'Failed'));
				else if (result.type === 'error') toast.error('Request failed');
				else {
					await update();
					open = false;
					toast.success(done);
				}
			};
		};

	const input =
		'w-full rounded-[7px] border bg-card px-2.5 py-[6px] text-[13px] outline-none focus:border-ring';
	const rowLabel = 'font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground';
</script>

<Popover.Root bind:open>
	{#if spec}
		<Popover.Trigger
			title="Edit field"
			class="cursor-pointer p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
		>
			<Pencil class="size-3" />
		</Popover.Trigger>
	{:else}
		<Popover.Trigger
			title="Add a field"
			class="flex cursor-pointer items-center px-4 py-3 text-muted-foreground transition-colors hover:text-foreground"
		>
			<Plus class="size-3.5" />
		</Popover.Trigger>
	{/if}
	<Popover.Content class="w-[280px] p-3" align="end">
		<form method="POST" action="?/saveField" use:enhance={onResult(spec ? 'Field updated' : 'Field added')}>
			<input type="hidden" name="name" value={spec?.name ?? ''} />
			<div class="flex flex-col gap-2.5">
				<label class="flex flex-col gap-1">
					<span class={rowLabel}>Field label</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={label} name="label" placeholder="e.g. Status" required autofocus class={input} />
				</label>
				<label class="flex flex-col gap-1">
					<span class={rowLabel}>Type {spec ? '· fixed once created' : ''}</span>
					<select bind:value={type} name="type" disabled={!!spec} class="{input} disabled:opacity-60">
						{#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
					</select>
				</label>
				{#if type === 'select'}
					<label class="flex flex-col gap-1">
						<span class={rowLabel}>Options</span>
						<input
							bind:value={optionsText}
							name="options"
							placeholder="Option A, Option B, …"
							class="{input} font-mono text-[12px]"
						/>
					</label>
				{:else if type === 'relation'}
					<label class="flex flex-col gap-1">
						<span class={rowLabel}>Links to</span>
						<select bind:value={ref} name="ref" class={input}>
							{#each refTargets as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
						</select>
					</label>
				{/if}
				<div class="flex items-center gap-4">
					<label class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
						<input type="checkbox" bind:checked={required} name="required" /> required
					</label>
				</div>
				<button
					type="submit"
					disabled={busy || !label.trim()}
					class="cursor-pointer rounded-[7px] bg-primary px-3 py-[7px] text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-40"
				>
					{busy ? 'Saving…' : spec ? 'Save field' : 'Add field'}
				</button>
			</div>
		</form>
		{#if spec}
			<form
				method="POST"
				action="?/removeField"
				use:enhance={onResult('Field removed')}
				class="mt-2 border-t pt-2"
			>
				<input type="hidden" name="name" value={spec.name} />
				{#if confirmRemove}
					<button
						type="submit"
						disabled={busy}
						class="w-full cursor-pointer rounded-[7px] border border-destructive/40 px-3 py-[6px] text-[11px] font-semibold text-destructive hover:bg-destructive/10"
					>
						Really remove — rows keep the values, unshown
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmRemove = true)}
						class="w-full cursor-pointer rounded-[7px] px-3 py-[6px] font-mono text-[10px] tracking-[0.06em] text-muted-foreground hover:text-destructive"
					>
						REMOVE FIELD
					</button>
				{/if}
			</form>
		{/if}
	</Popover.Content>
</Popover.Root>
