<script lang="ts">
	// A markdown field you can drop anywhere: the block editor (formatting as
	// you type, "/" menu, tables, buttons) with a raw-markdown tab as the escape
	// hatch. Extracted from the note detail page so there is one implementation
	// rather than one per place that wants a document.
	//
	// Inside a <form> it behaves like a native control. The value rides along in
	// a hidden input, and every edit dispatches a real `input` event from it, so
	// an enclosing form's oninput — which is how record pages autosave — fires
	// without the caller wiring anything up. Programmatic value changes do not
	// emit events on their own, which is exactly the trap this avoids.
	import type { Snippet } from 'svelte';
	import NoteEditor from './editor/NoteEditor.svelte';

	let {
		value = $bindable(''),
		name,
		onchange,
		onsave,
		placeholder,
		compact = false,
		header
	}: {
		value?: string;
		// Omit outside a form — then the value is only read through bind:value.
		name?: string;
		onchange?: (md: string) => void;
		onsave?: () => void;
		placeholder?: string;
		// Inline in a record form, where the field shares space with others.
		compact?: boolean;
		// Rendered at the left of the toolbar, opposite the Doc/Markdown toggle.
		header?: Snippet;
	} = $props();

	let tab = $state<'doc' | 'md'>('doc');
	let hidden = $state<HTMLInputElement | null>(null);

	function commit(md: string) {
		value = md;
		onchange?.(md);
		// Let the DOM value settle before the form reads it back.
		queueMicrotask(() => hidden?.dispatchEvent(new Event('input', { bubbles: true })));
	}

	const tabCls = (active: boolean) =>
		`cursor-pointer rounded-[6px] px-3 py-1 text-[11px] font-semibold ${
			active ? 'bg-primary text-primary-foreground' : 'text-foreground/70'
		}`;
</script>

{#if name}
	<input bind:this={hidden} type="hidden" {name} {value} />
{/if}

<div class="grid gap-2">
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">{@render header?.()}</div>
		<div class="inline-flex flex-none gap-0.5 rounded-[8px] bg-muted p-[3px]">
			<button type="button" onclick={() => (tab = 'doc')} class={tabCls(tab === 'doc')}>Doc</button>
			<button type="button" onclick={() => (tab = 'md')} class={tabCls(tab === 'md')}>
				Markdown
			</button>
		</div>
	</div>

	{#if tab === 'md'}
		<textarea
			{value}
			oninput={(e) => commit((e.currentTarget as HTMLTextAreaElement).value)}
			onkeydown={(e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
					e.preventDefault();
					onsave?.();
				}
			}}
			rows={Math.min(28, Math.max(compact ? 6 : 10, value.split('\n').length + 3))}
			placeholder="Raw markdown…"
			class="w-full resize-y rounded-[9px] border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.6] outline-none focus:border-ring"
		></textarea>
	{:else}
		<!-- Remounted per tab switch: the editor reads its content once, so it has
		     to be rebuilt to pick up edits made in the raw markdown tab. -->
		{#key tab}
			<NoteEditor
				{value}
				{onsave}
				{placeholder}
				minHeight={compact ? 96 : 180}
				onchange={commit}
			/>
		{/key}
	{/if}
</div>
