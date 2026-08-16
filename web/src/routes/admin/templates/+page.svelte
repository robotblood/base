<script lang="ts">
	// Admin → Templates: author the markdown blocks the editor's "/" menu
	// offers. The body is edited in the same MarkdownField every document
	// field uses, so the Doc tab is a live preview of exactly what the
	// template will drop in.
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import type { MdTemplate } from '$lib/templates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Which editor is open: 'new', a template id, or nothing. One draft pair
	// serves both — only one editor is ever open.
	let editing = $state<'new' | string | null>(null);
	let confirmDelete = $state<string | null>(null);
	let draftName = $state('');
	let draftBody = $state('');
	let error = $state<string | null>(null);

	function open(t?: MdTemplate) {
		editing = t?.id ?? 'new';
		draftName = t?.name ?? '';
		draftBody = t?.body ?? '';
		error = null;
		confirmDelete = null;
	}

	const firstLine = (body: string) =>
		body
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)[0]
			?.slice(0, 96) ?? '';

	const lines = (body: string) => body.split('\n').filter((l) => l.trim()).length;
</script>

<svelte:head><title>base — admin · templates</title></svelte:head>

{#snippet editorForm(id: string | null)}
	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'success') editing = null;
				else if (result.type === 'failure')
					error = String(result.data?.message ?? 'Save failed');
				await update();
			}}
		class="grid gap-3 border-b bg-muted/40 px-5 py-4"
	>
		{#if id}<input type="hidden" name="id" value={id} />{/if}
		<input
			name="name"
			bind:value={draftName}
			placeholder="Template name — how it reads in the “/” menu"
			class="w-full rounded-[8px] border bg-background px-3.5 py-2 text-sm font-semibold outline-none focus:border-ring"
		/>
		<MarkdownField
			name="body"
			bind:value={draftBody}
			compact
			placeholder="The markdown this template drops in — headings, checklists, tables…"
		/>
		<div class="flex flex-wrap items-center gap-3">
			<button
				class="cursor-pointer rounded-[7px] bg-primary px-3 py-[6px] text-[12px] font-semibold text-primary-foreground hover:opacity-90"
				>Save template</button
			>
			<button
				type="button"
				onclick={() => (editing = null)}
				class="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground/80"
				>Cancel</button
			>
			<span class="ml-auto font-mono text-[10px] text-muted-foreground">
				{'{{date}}'} · {'{{time}}'} · {'{{weekday}}'} fill in when inserted
			</span>
		</div>
		{#if error}
			<p class="text-[12.5px] font-medium text-destructive">{error}</p>
		{/if}
	</form>
{/snippet}

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="SYS"
		title="Templates"
		subtitle={`${data.templates.length} ${data.templates.length === 1 ? 'template' : 'templates'} · offered by the “/” menu in every document field`}
	/>

	<div class="mt-6 max-w-3xl">
		<div class="mb-2 flex items-center justify-between">
			<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
				>Markdown templates</span
			>
			<button
				onclick={() => (editing === 'new' ? (editing = null) : open())}
				class="cursor-pointer rounded-[7px] bg-primary px-3 py-[6px] text-[12px] font-semibold text-primary-foreground hover:opacity-90"
			>
				{editing === 'new' ? 'Close' : '+ New template'}
			</button>
		</div>
		<p class="mb-4 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			A template is a block of markdown you reuse — a meeting skeleton, a checklist, a review
			form. Each one shows up in the editor's “/” menu (type “/” then its name) in notes and
			every other long-text field. <span class="font-mono text-[12px]">{'{{date}}'}</span>,
			<span class="font-mono text-[12px]">{'{{time}}'}</span> and
			<span class="font-mono text-[12px]">{'{{weekday}}'}</span> are filled in at insert time.
		</p>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			{#if editing === 'new'}
				{@render editorForm(null)}
			{/if}
			<div class="divide-y">
				{#each data.templates as t (t.id)}
					<div>
						<div class="flex items-center gap-3 px-5 py-2.5">
							<button
								onclick={() => (editing === t.id ? (editing = null) : open(t))}
								class="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-semibold hover:underline"
								title="Edit this template"
							>
								{t.name}
								<span class="ml-2 font-normal text-muted-foreground">{firstLine(t.body)}</span>
							</button>
							<span class="flex-none font-mono text-[11px] text-muted-foreground"
								>{lines(t.body)} {lines(t.body) === 1 ? 'line' : 'lines'}</span
							>
							<button
								onclick={() => (editing === t.id ? (editing = null) : open(t))}
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
								>{editing === t.id ? 'CLOSE' : 'EDIT'}</button
							>
							{#if confirmDelete === t.id}
								<form
									method="POST"
									action="?/remove"
									use:enhance={() =>
										async ({ update }) => {
											confirmDelete = null;
											await update();
										}}
								>
									<input type="hidden" name="id" value={t.id} />
									<button
										class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
										>DELETE?</button
									>
								</form>
								<button
									onclick={() => (confirmDelete = null)}
									class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
									>keep</button
								>
							{:else}
								<button
									onclick={() => (confirmDelete = t.id)}
									class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
									>DELETE</button
								>
							{/if}
						</div>
						{#if editing === t.id}
							{@render editorForm(t.id)}
						{/if}
					</div>
				{:else}
					{#if editing !== 'new'}
						<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
							No templates yet — write the first one and it appears in the “/” menu everywhere.
						</p>
					{/if}
				{/each}
			</div>
		</section>
	</div>
</div>
