<script lang="ts">
	// Redesigned Projects experience (Claude Design handoff, Phase 1 prototype).
	// A single stateful page, mirroring the mock's list ↔ detail navigation, that
	// slots into the app's existing shell (sidebar + theme toggle live in the
	// root layout). This static route overrides the generic /[module] page.
	import { Tracker } from '$lib/projects/tracker.svelte';
	import ProjectsListView from '$lib/components/projects/ProjectsListView.svelte';
	import ProjectDetailView from '$lib/components/projects/ProjectDetailView.svelte';
	import NewProjectModal from '$lib/components/projects/NewProjectModal.svelte';

	const t = new Tracker();
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
