<script lang="ts">
	// Redesigned Projects experience (Claude Design handoff). A single stateful
	// page, mirroring the mock's list ↔ detail navigation, that slots into the
	// app's existing shell (sidebar + theme toggle live in the root layout).
	// This static route overrides the generic /[module] page; data is real
	// (FastAPI via the server load), mutations persist through /projects/sync.
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
	const t = new Tracker(data.projects);
	const current = $derived(t.current);
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
