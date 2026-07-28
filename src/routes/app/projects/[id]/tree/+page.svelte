<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { currentProject } from "$lib/state/projects.svelte";
  import { slicesLoaded } from "$lib/state/slices.svelte";
  import {
    build,
    built,
    forgetOtherProject,
    groupSlices,
    isStale,
    loadSettings,
    selected,
    settings
  } from "$lib/state/tree.svelte";
  import BuildSettings from "$lib/components/projects/tree/build-settings.svelte";
  import Canvas from "$lib/components/projects/tree/canvas.svelte";
  import DetailPanel from "$lib/components/projects/tree/detail-panel.svelte";
  import GroupHeader from "$lib/components/projects/tree/group-header.svelte";
  import VariantSlider from "$lib/components/projects/tree/variant-slider.svelte";
  import ViewLegend from "$lib/components/projects/tree/view-legend.svelte";
  import VisualizationSettings from "$lib/components/projects/tree/visualization-settings.svelte";
  import Network from "@lucide/svelte/icons/network";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  const project = $derived(currentProject());
  const groups = $derived(groupSlices());
  const stale = $derived(isStale());

  let panelOpen = $state(true);
  // Clicking a node is a request to read it, so it reopens a closed panel —
  // otherwise the click would look like it did nothing.
  $effect(() => {
    if (selected.id !== null) panelOpen = true;
  });

  $effect(() => {
    if (!project) return;
    forgetOtherProject(project.id);
    if (settings.projectId !== project.id) loadSettings(project.id);
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      {#if built.tree}
        <!-- The size of what is on screen, and the control over it, first thing
             on the bar: the tree itself never says what it left out. -->
        <VariantSlider tree={built.tree} />
      {/if}
      {#if stale}
        <p class="text-destructive text-xs">
          Filters or settings changed since this tree was built.
        </p>
      {/if}
      {#if built.error}
        <p class="text-destructive truncate text-xs">{built.error}</p>
      {/if}
      <div class="ml-auto flex items-center gap-2">
        <BuildSettings {project} />
        {#if built.tree}
          <VisualizationSettings tree={built.tree} />
        {/if}
        <Button size="sm" disabled={built.building || !groups[0]} onclick={() => build(project)}>
          {#if built.tree}
            <RefreshCw data-icon="inline-start" class={built.building ? "animate-spin" : ""} />
            Rebuild
          {:else}
            <Play data-icon="inline-start" />
            {built.building ? "Building…" : "Build tree"}
          {/if}
        </Button>
      </div>
    </div>

    {#if built.tree}
      <GroupHeader tree={built.tree} />
      <div class="flex min-h-0 flex-1">
        <div class="relative flex min-h-0 flex-1">
          <Canvas tree={built.tree} {stale} />
          <ViewLegend />
          <Button
            variant="outline"
            size="sm"
            class="bg-background/90 absolute top-3 right-3 z-10 backdrop-blur"
            aria-pressed={panelOpen}
            onclick={() => (panelOpen = !panelOpen)}
          >
            <PanelRight data-icon="inline-start" />
            {panelOpen ? "Hide details" : "Show details"}
          </Button>
        </div>
        {#if panelOpen}
          <DetailPanel tree={built.tree} nodeId={selected.id} onClose={() => (panelOpen = false)} />
        {/if}
      </div>
    {:else}
      <div class="bg-sidebar flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty.Root>
          <Empty.Header>
            <Empty.Media variant="icon">
              <Network />
            </Empty.Media>
            <Empty.Title>No tree built yet</Empty.Title>
            <Empty.Description>
              {#if !slicesLoaded.projectId}
                Loading slices…
              {:else if !groups[0]}
                Create a slice in the Filters view first — a slice defines a group.
              {:else if !groups[1]}
                Only one slice exists, so the tree will render without comparisons. Add a second
                slice to compare two groups.
              {:else}
                Building runs a full scan of the log and one Significance Test per node and
                attribute, so it only happens when you ask.
              {/if}
            </Empty.Description>
          </Empty.Header>
          {#if groups[0]}
            <Button disabled={built.building} onclick={() => build(project)}>
              <Play data-icon="inline-start" />
              {built.building ? "Building…" : "Build tree"}
            </Button>
          {:else}
            <Button variant="outline" href="/app/projects/{project.id}/filters">
              Go to Filters
            </Button>
          {/if}
        </Empty.Root>
      </div>
    {/if}
  </div>
{/if}
