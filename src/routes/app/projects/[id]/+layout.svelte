<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject, projectsLoaded } from "$lib/event-log/state/projects.svelte";
  import { groupsLoaded, loadGroups } from "$lib/groups/state/groups.svelte";
  import ProjectTopbar from "$lib/components/layout/topbar.svelte";
  import FilterSummaryBar from "$lib/groups/components/filter-summary-bar.svelte";
  import TourLauncher from "$lib/tour/components/tour-launcher.svelte";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { children } = $props();

  const project = $derived(currentProject());
  const onFilters = $derived(page.url.pathname.endsWith("/filters"));
  const view = $derived(
    onFilters
      ? "filters"
      : page.url.pathname.endsWith("/tree")
        ? "tree"
        : page.url.pathname.endsWith("/dfg")
          ? "dfg"
          : page.url.pathname.endsWith("/distributions")
            ? "distributions"
            : "statistics"
  );

  $effect(() => {
    if (!project && projectsLoaded.value) goto("/app/projects");
  });

  // Groups are project-scoped, so they reload when the addressed project changes.
  $effect(() => {
    if (project && groupsLoaded.projectId !== project.id) loadGroups(project.id);
  });
</script>

{#if project}
  <ProjectTopbar {project} projectView={view}>
    {#snippet actions()}
      <TourLauncher {project} {view} />
    {/snippet}
  </ProjectTopbar>
  <FilterSummaryBar {project}>
    {#snippet actions()}
      {#if !onFilters}
        <Button variant="outline" size="sm" href="/app/projects/{project.id}/filters">
          <SlidersHorizontal data-icon="inline-start" />
          Edit filters
        </Button>
      {/if}
    {/snippet}
  </FilterSummaryBar>
  {@render children()}
{/if}
