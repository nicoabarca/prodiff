<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import {
    build,
    built,
    comparison,
    forgetOtherProject,
    comparedGroups,
    isStale,
    loadComparison,
    loadSettings,
    selected,
    settings,
    variants
  } from "$lib/tree/state/tree.svelte";
  import BuildSettings from "$lib/tree/components/build-settings.svelte";
  import Canvas from "$lib/tree/components/canvas.svelte";
  import CompareDialog from "$lib/tree/components/compare-dialog.svelte";
  import DetailPanel from "$lib/tree/components/detail-panel.svelte";
  import GroupHeader from "$lib/tree/components/group-header.svelte";
  import VariantPicker from "$lib/tree/components/variant-picker.svelte";
  import ViewLegend from "$lib/tree/components/view-legend.svelte";
  import VisualizationSettings from "$lib/tree/components/visualization-settings.svelte";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Network from "@lucide/svelte/icons/network";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Play from "@lucide/svelte/icons/play";
  import GitCompare from "@lucide/svelte/icons/git-compare";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  const project = $derived(currentProject());
  const groups = $derived(comparedGroups());
  const stale = $derived(isStale());

  // Empty before the variant list loads means "never chosen"; after it, "cleared".
  const noVariants = $derived(
    variants.key !== null && settings.value.selectedVariants.length === 0
  );

  let comparing = $state(false);

  let panelOpen = $state(false);
  $effect(() => {
    panelOpen = selected.id !== null;
  });

  $effect(() => {
    if (!project) return;
    forgetOtherProject(project.id);
    if (settings.projectId !== project.id) loadSettings(project.id);
    if (comparison.projectId !== project.id) loadComparison(project.id);
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <VariantPicker {project} tree={built.tree} />
      {#if stale && !built.building}
        <p class="text-destructive text-xs">
          Filters, variants or settings changed since this tree was built.
        </p>
      {/if}
      {#if built.error}
        <p class="text-destructive truncate text-xs">{built.error}</p>
      {/if}
      <div class="ml-auto flex items-center gap-2">
        <!-- Which groups the tree measures against, and what they share —
             overlap is settled here, at selection time, rather than left for
             the reader to notice on the finished tree. -->
        <Button variant="outline" size="sm" onclick={() => (comparing = true)}>
          <GitCompare data-icon="inline-start" />
          {groups[1] ? `${groups[0].name} vs ${groups[1].name}` : groups[0].name}
        </Button>
        <BuildSettings {project} />
        {#if built.tree}
          <VisualizationSettings tree={built.tree} />
        {/if}
        <Button
          size="sm"
          disabled={built.building || !groups[0] || noVariants}
          title={noVariants ? "Select at least one variant" : undefined}
          onclick={() => build(project)}
        >
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

    <CompareDialog {project} bind:open={comparing} />

    {#if built.tree}
      <GroupHeader tree={built.tree} />
      <div class="flex min-h-0 flex-1">
        <div class="relative flex min-h-0 flex-1">
          <Canvas tree={built.tree} {stale} />
          <ViewLegend />
          {#if selected.id !== null}
            <div class="absolute top-3 right-3 z-10 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="bg-background/90 backdrop-blur"
                href="/app/projects/{project.id}/distributions"
              >
                <ChartColumn data-icon="inline-start" />
                Distributions
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="bg-background/90 backdrop-blur"
                aria-pressed={panelOpen}
                onclick={() => (panelOpen = !panelOpen)}
              >
                <PanelRight data-icon="inline-start" />
                {panelOpen ? "Hide" : "Show"} differences panel
              </Button>
            </div>
          {/if}
        </div>
        {#if panelOpen}
          <DetailPanel
            tree={built.tree}
            nodeId={selected.id}
            onClose={() => (selected.id = null)}
          />
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
              {#if !groupsLoaded.projectId}
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
