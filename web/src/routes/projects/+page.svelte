<script lang="ts">
	// Redesigned Projects experience (Claude Design handoff). A single stateful
	// page, mirroring the mock's list ↔ detail navigation, that slots into the
	// app's existing shell (sidebar + theme toggle live in the root layout).
	// This static route overrides the generic /[module] page; data is real
	// (FastAPI via the server load), mutations persist through /projects/sync.
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import { Tracker } from '$lib/projects/tracker.svelte';
	import ProjectsListView from '$lib/components/projects/ProjectsListView.svelte';
	import ProjectDetailView from '$lib/components/projects/ProjectDetailView.svelte';
	import NewProjectModal from '$lib/components/projects/NewProjectModal.svelte';
	import FolderPicker from '$lib/components/projects/FolderPicker.svelte';

	let { data }: PageProps = $props();

	// The tracker intentionally captures the initial load and owns all state
	// from there (mutations are optimistic; the page is never re-loaded).
	// svelte-ignore state_referenced_locally
	const t = new Tracker(data.projects, { directory: data.directory, merchPool: data.merchPool });
	const current = $derived(t.current);
	onDestroy(() => t.stopWatch());

	// Deep links (?open, ?tab, ?new). SvelteKit reuses this component for
	// in-app navigations to /projects, so ?open has to be watched, not read
	// once at init — the command palette jumping from one open project to
	// another changes only the query string. Keyed on the raw search string so
	// the effect re-applies exactly when the URL changes and never when
	// tracker state does (closing a project doesn't rewrite the URL, and the
	// leftover ?open must not force the panel back open).
	let applied = '';
	$effect(() => {
		const qs = page.url.search;
		if (qs === applied) return;
		applied = qs;
		if (data.open && t.find(data.open)) {
			t.openProject(data.open);
			if (data.tab === 'rundown') t.wsTab = 'rundown';
		} else if (data.startNew) {
			t.newOpen = true;
		}
	});
</script>

<svelte:head><title>base — Projects</title></svelte:head>

{#if t.route.name === 'project' && current}
	<ProjectDetailView {t} p={current} />
{:else}
	<ProjectsListView {t} />
{/if}

{#if t.newOpen}
	<NewProjectModal {t} />
{/if}

{#if t.picker}
	{#key t.picker.pid}
		<FolderPicker {t} />
	{/key}
{/if}
