<script lang="ts">
	// Renders a markdown string as a formatted document, styled to the app.
	// Content is the user's own notes on a local single-user system, so raw
	// HTML pass-through from marked is acceptable here.
	import { marked } from 'marked';

	let { source = '' }: { source?: string } = $props();

	const html = $derived(marked.parse(source, { async: false, gfm: true, breaks: true }));
</script>

<div class="md-doc text-[14px] leading-[1.65] text-foreground/85">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>

<style>
	.md-doc :global(h1) {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 1.1em 0 0.4em;
	}
	.md-doc :global(h2) {
		font-size: 17px;
		font-weight: 700;
		margin: 1.1em 0 0.35em;
	}
	.md-doc :global(h3) {
		font-size: 14.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 1em 0 0.3em;
	}
	.md-doc :global(h1:first-child),
	.md-doc :global(h2:first-child),
	.md-doc :global(h3:first-child) {
		margin-top: 0.1em;
	}
	.md-doc :global(p) {
		margin: 0.45em 0;
	}
	.md-doc :global(ul),
	.md-doc :global(ol) {
		margin: 0.45em 0;
		padding-left: 1.4em;
	}
	.md-doc :global(ul) {
		list-style: disc;
	}
	.md-doc :global(ol) {
		list-style: decimal;
	}
	.md-doc :global(li) {
		margin: 0.18em 0;
	}
	.md-doc :global(li input[type='checkbox']) {
		margin-right: 0.45em;
	}
	.md-doc :global(blockquote) {
		border-left: 3px solid var(--border);
		margin: 0.6em 0;
		padding: 0.1em 0 0.1em 0.9em;
		color: var(--muted-foreground);
	}
	.md-doc :global(code) {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 12px;
		background: var(--muted);
		border-radius: 4px;
		padding: 0.1em 0.35em;
	}
	.md-doc :global(pre) {
		background: var(--muted);
		border-radius: 8px;
		padding: 10px 12px;
		overflow-x: auto;
		margin: 0.6em 0;
	}
	.md-doc :global(pre code) {
		background: transparent;
		padding: 0;
	}
	.md-doc :global(a) {
		color: #3a6ea5;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.md-doc :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1em 0;
	}
	.md-doc :global(table) {
		border-collapse: collapse;
		margin: 0.6em 0;
		font-size: 13px;
	}
	.md-doc :global(th),
	.md-doc :global(td) {
		border: 1px solid var(--border);
		padding: 4px 10px;
		text-align: left;
	}
	.md-doc :global(th) {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted-foreground);
	}
	.md-doc :global(img) {
		max-width: 100%;
		border-radius: 8px;
	}
	.md-doc :global(strong) {
		font-weight: 700;
	}
</style>
