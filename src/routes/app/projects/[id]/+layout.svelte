<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject, projectsLoaded } from "$lib/state/projects.svelte";
  import { loadSlices, slicesLoaded } from "$lib/state/slices.svelte";
  import ProjectTopbar from "$lib/components/layout/topbar.svelte";
  import FilterSummaryBar from "$lib/components/projects/filter-summary-bar.svelte";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { children } = $props();

  const project = $derived(currentProject());
  const onFilters = $derived(page.url.pathname.endsWith("/filters"));

  $effect(() => {
    if (!project && projectsLoaded.value) goto("/app/projects");
  });

  // Slices are project-scoped, so they reload whenever the addressed project
  // changes — including when the user navigates straight from one project to
  // another without passing through the list.
  $effect(() => {
    if (project && slicesLoaded.projectId !== project.id) loadSlices(project.id);
  });
</script>

{#if project}
  <ProjectTopbar {project} projectView={onFilters ? "filters" : "statistics"}>
    {#snippet actions()}
      {#if !onFilters}
        <Button variant="outline" size="sm" href="/app/projects/{project.id}/filters">
          <SlidersHorizontal data-icon="inline-start" />
          Edit filters
        </Button>
      {/if}
    {/snippet}
  </ProjectTopbar>
  <FilterSummaryBar projectId={project.id} />
  {@render children()}
{/if}
