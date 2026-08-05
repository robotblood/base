<script lang="ts">
	// Settings for a note button: what it says, where it goes, how loud it looks.
	// The target can be typed by hand (any URL or app path) or picked from a
	// module search, which fills in the record's own path.
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { MODULES } from '$lib/modules';
	import type { ButtonVariant, NoteButtonAttrs } from './button';

	let {
		open = $bindable(false),
		attrs,
		isNew = false,
		onsubmit,
		onremove
	}: {
		open?: boolean;
		attrs: NoteButtonAttrs;
		isNew?: boolean;
		onsubmit: (next: { label: string; href: string; variant: ButtonVariant }) => void;
		onremove: () => void;
	} = $props();

	let label = $state('');
	let href = $state('');
	let variant = $state<ButtonVariant>('primary');

	// Record search: which module to look in, and what's been found.
	let module = $state('notes');
	let query = $state('');
	let results = $state<{ id: number; label: string; href: string }[]>([]);
	let searching = $state(false);
	let searchToken = 0;
	// Whether this session ended in a deliberate save or remove. A brand-new
	// button that closes any other way (Cancel, Escape, click-away) is discarded
	// rather than left in the document as an unconfigured stub.
	let committed = false;

	// Reload the form whenever a different button opens it.
	$effect(() => {
		if (!open) return;
		label = attrs.label ?? '';
		href = attrs.href ?? '';
		variant = attrs.variant ?? 'primary';
		query = '';
		results = [];
		committed = false;
	});

	async function search() {
		const token = ++searchToken;
		searching = true;
		try {
			const params = new URLSearchParams({ module });
			if (query.trim()) params.set('q', query.trim());
			const res = await fetch(`/lookup?${params}`);
			const data = res.ok ? await res.json() : { results: [] };
			// Ignore a response that a newer keystroke has already superseded.
			if (token === searchToken) results = data.results ?? [];
		} finally {
			if (token === searchToken) searching = false;
		}
	}

	function pick(r: { label: string; href: string }) {
		href = r.href;
		if (!label.trim() || label === 'Button') label = r.label;
	}

	function save() {
		committed = true;
		onsubmit({ label: label.trim() || 'Button', href: href.trim(), variant });
		open = false;
	}

	function remove() {
		committed = true;
		onremove();
		open = false;
	}

	const variants: { key: ButtonVariant; label: string }[] = [
		{ key: 'primary', label: 'Primary' },
		{ key: 'secondary', label: 'Secondary' }
	];
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next && isNew && !committed) onremove();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isNew ? 'Add button' : 'Button'}</Dialog.Title>
			<Dialog.Description>A link styled as a call to action.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="space-y-1.5">
				<Label for="btn-label">Label</Label>
				<Input id="btn-label" bind:value={label} placeholder="Open settlement" />
			</div>

			<div class="space-y-1.5">
				<Label for="btn-href">Target</Label>
				<Input id="btn-href" bind:value={href} placeholder="/shows/412 or https://…" />
				<p class="font-mono text-[10px] text-muted-foreground">
					An app path, a full URL, or pick a record below.
				</p>
			</div>

			<div class="space-y-1.5">
				<Label>Style</Label>
				<div class="flex gap-1.5">
					{#each variants as v (v.key)}
						<button
							type="button"
							onclick={() => (variant = v.key)}
							class="cursor-pointer rounded-[7px] border px-3 py-1.5 text-[12px] font-semibold {variant ===
							v.key
								? 'border-ring bg-accent'
								: 'text-muted-foreground'}"
						>
							{v.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="space-y-1.5 border-t pt-3.5">
				<Label for="btn-search">Link to a record</Label>
				<div class="flex gap-1.5">
					<select
						bind:value={module}
						onchange={search}
						aria-label="Module to search"
						class="h-8 w-[34%] rounded-lg border border-input bg-background px-2 text-[12px] text-foreground outline-none focus-visible:border-ring [&_option]:bg-popover [&_option]:text-popover-foreground"
					>
						{#each MODULES as m (m.key)}
							<option value={m.key}>{m.label}</option>
						{/each}
					</select>
					<Input
						id="btn-search"
						bind:value={query}
						placeholder="Search…"
						class="h-8 flex-1 text-[12px]"
						onkeydown={(e: KeyboardEvent) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								search();
							}
						}}
					/>
					<Button type="button" variant="outline" class="h-8 px-3 text-[12px]" onclick={search}>
						Find
					</Button>
				</div>

				{#if results.length}
					<div class="max-h-[150px] overflow-y-auto rounded-[8px] border">
						{#each results as r (r.href)}
							<button
								type="button"
								onclick={() => pick(r)}
								class="flex w-full cursor-pointer items-center justify-between gap-3 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent {href ===
								r.href
									? 'bg-accent'
									: ''}"
							>
								<span class="truncate">{r.label}</span>
								<span class="flex-none font-mono text-[10px] text-muted-foreground">{r.href}</span>
							</button>
						{/each}
					</div>
				{:else if searching}
					<p class="px-0.5 py-1 text-[12px] text-muted-foreground">Searching…</p>
				{/if}
			</div>
		</div>

		<Dialog.Footer class="mt-1 sm:justify-between">
			<Button type="button" variant="ghost" class="text-muted-foreground" onclick={remove}>
				Remove
			</Button>
			<div class="flex gap-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="button" onclick={save}>{isNew ? 'Add' : 'Save'}</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
