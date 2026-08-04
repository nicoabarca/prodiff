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
    settings,
    variants
  } from "$lib/state/tree.svelte";
  import { drawer, forgetDistributions } from "$lib/state/distributions.svelte";
  import BuildSettings from "$lib/components/projects/tree/build-settings.svelte";
  import Canvas from "$lib/components/projects/tree/canvas.svelte";
  import DetailPanel from "$lib/components/projects/tree/detail-panel.svelte";
  import DistributionDrawer from "$lib/components/projects/tree/distribution-drawer.svelte";
  import GroupHeader from "$lib/components/projects/tree/group-header.svelte";
  import VariantPicker from "$lib/components/projects/tree/variant-picker.svelte";
  import ViewLegend from "$lib/components/projects/tree/view-legend.svelte";
  import VisualizationSettings from "$lib/components/projects/tree/visualization-settings.svelte";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Network from "@lucide/svelte/icons/network";
  import PanelBottom from "@lucide/svelte/icons/panel-bottom";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  const project = $derived(currentProject());
  const groups = $derived(groupSlices());
  const stale = $derived(isStale());

  // An empty selection means two different things. Before the variant list has
  // loaded it means "never chosen", and the backend opens on the most common
  // variants — a perfectly good cold build. Once the list has loaded the
  // selection has been seeded, so empty can only mean the user cleared it, and
  // building would draw nothing.
  const noVariants = $derived(
    variants.key !== null && settings.value.selectedVariants.length === 0
  );

  let panelOpen = $state(false);
  // The panel follows the selection: clicking a node is a request to read it,
  // and clicking the empty canvas drops the selection, so there is nothing
  // left for the panel to say.
  $effect(() => {
    panelOpen = selected.id !== null;
  });

  $effect(() => {
    if (!project) return;
    forgetOtherProject(project.id);
    if (settings.projectId !== project.id) loadSettings(project.id);
  });

  // The drawer's numbers describe one node of one tree; both change here.
  $effect(() => {
    void [project?.id, built.key];
    forgetDistributions();
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <!-- The size of what is on screen, and the control over it, first thing
           on the bar: the tree itself never says what it left out. Available
           before the first build too — the variant list doesn't need one. -->
      <VariantPicker {project} tree={built.tree} />
      <!-- Silent while building: the button's own spinner already says the
           numbers are catching up. -->
      {#if stale && !built.building}
        <p class="text-destructive text-xs">
          Filters, variants or settings changed since this tree was built.
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
        <!-- An empty selection is prevented rather than reported: it would
             build a tree with nothing on it. -->
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

    {#if built.tree}
      <GroupHeader tree={built.tree} />
      <div class="flex min-h-0 flex-1">
        <div class="relative flex min-h-0 flex-1">
          <Canvas tree={built.tree} {stale} />
          <ViewLegend />
          <!-- Only offered while a node is selected: with nothing selected the
               panel has nothing to compare, so "Show" would open an empty
               rail. -->
          {#if selected.id !== null}
            <div class="absolute top-3 right-3 z-10 flex items-center gap-2">
              <!-- Two independent toggles: the panel says what differs at this
                   node, the drawer what the distributions look like. Reading
                   both together is the normal case, so neither closes the
                   other. -->
              <Button
                variant="outline"
                size="sm"
                class="bg-background/90 backdrop-blur"
                aria-pressed={drawer.open}
                onclick={() => (drawer.open = !drawer.open)}
              >
                <PanelBottom data-icon="inline-start" />
                <ChartColumn data-icon="inline-start" />
                {drawer.open ? "Hide" : "Show"} distributions
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
          <DetailPanel tree={built.tree} nodeId={selected.id} onClose={() => (selected.id = null)} />
        {/if}
      </div>
      <!-- Below both the canvas and the panel, spanning the full width. -->
      {#if drawer.open}
        <DistributionDrawer {project} tree={built.tree} />
      {/if}
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
