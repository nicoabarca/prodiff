<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject, projectsLoaded } from "$lib/event-log/state/projects.svelte";
  import { groupsLoaded, loadGroups } from "$lib/groups/state/groups.svelte";
  import ProjectTopbar from "$lib/components/layout/topbar.svelte";
  import FilterSummaryBar from "$lib/groups/components/filter-summary-bar.svelte";
  import ApplyingOverlay from "$lib/custom-attributes/components/applying-overlay.svelte";
  import {
    customAttributesLoaded,
    loadCustomAttributes
  } from "$lib/custom-attributes/state/custom-attributes.svelte";
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
            : page.url.pathname.endsWith("/custom-attributes")
              ? "custom-attributes"
              : "statistics"
  );

  $effect(() => {
    if (!project && projectsLoaded.value) goto("/app/projects");
  });

  // Groups are project-scoped, so they reload when the addressed project changes.
  $effect(() => {
    if (project && groupsLoaded.projectId !== project.id) loadGroups(project.id);
  });

  $effect(() => {
    if (project && customAttributesLoaded.projectId !== project.id) {
      loadCustomAttributes(project.id);
    }
  });
</script>

<!-- Every view sends applied Custom Attributes with its Column Mapping, so none renders before
     they are loaded. -->
{#if project && customAttributesLoaded.projectId === project.id}
  <ProjectTopbar {project} projectView={view} />
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
  <ApplyingOverlay />
{/if}
