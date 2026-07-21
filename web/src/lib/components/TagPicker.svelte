<script lang="ts">
	// A tag input that lets you pick from tags you've already used (shown as
	// clickable pills) and create new ones by typing. Submits a single hidden
	// input holding the comma-joined tags, matching the `tags` contract in
	// coerce.ts, so no server-side changes are needed.
	import X from '@lucide/svelte/icons/x';

	let {
		name,
		value = [],
		suggestions = []
	}: { name: string; value?: unknown; suggestions?: string[] } = $props();

	function toTags(v: unknown): string[] {
		if (Array.isArray(v)) return v.map(String).filter(Boolean);
		if (typeof v === 'string')
			return v
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
		return [];
	}

	// `value` is an initial value only; the form remounts (keyed on record id)
	// when the record changes, so we deliberately capture it once.
	// svelte-ignore state_referenced_locally
	let selected = $state<string[]>(toTags(value));
	let draft = $state('');

	const joined = $derived(selected.join(', '));

	// Suggestions not yet chosen, filtered by what's being typed.
	const matches = $derived(
		suggestions
			.filter((s) => !selected.some((t) => t.toLowerCase() === s.toLowerCase()))
			.filter((s) => s.toLowerCase().includes(draft.trim().toLowerCase()))
			.slice(0, 12)
	);

	function add(tag: string) {
		const t = tag.trim();
		if (!t) return;
		if (!selected.some((x) => x.toLowerCase() === t.toLowerCase())) selected = [...selected, t];
		draft = '';
	}

	function remove(tag: string) {
		selected = selected.filter((t) => t !== tag);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add(draft);
		} else if (e.key === 'Backspace' && draft === '' && selected.length) {
			selected = selected.slice(0, -1);
		}
	}

	const pill =
		'inline-flex items-center gap-1 rounded-full border border-input px-2 py-0.5 font-mono text-[11px]';
</script>

<!-- The value the form actually submits. -->
<input type="hidden" {name} value={joined} />

<div
	class="border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 transition-colors focus-within:ring-3"
>
	{#each selected as tag (tag)}
		<span class="{pill} bg-secondary text-secondary-foreground">
			{tag}
			<button
				type="button"
				aria-label={`Remove ${tag}`}
				onclick={() => remove(tag)}
				class="text-muted-foreground hover:text-foreground -mr-0.5"
			>
				<X class="size-3" />
			</button>
		</span>
	{/each}
	<input
		bind:value={draft}
		onkeydown={onKeydown}
		placeholder={selected.length ? 'Add tag…' : 'Type a tag, press Enter…'}
		class="text-foreground min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
	/>
</div>

{#if draft.trim() && !suggestions.some((s) => s.toLowerCase() === draft.trim().toLowerCase())}
	<button
		type="button"
		onclick={() => add(draft)}
		class="text-muted-foreground hover:text-foreground mt-1.5 w-fit font-mono text-[11px]"
	>
		+ Create “{draft.trim()}”
	</button>
{/if}

{#if matches.length}
	<div class="mt-1.5 flex flex-wrap gap-1.5">
		{#each matches as s (s)}
			<button
				type="button"
				onclick={() => add(s)}
				class="{pill} text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
			>
				{s}
			</button>
		{/each}
	</div>
{/if}
