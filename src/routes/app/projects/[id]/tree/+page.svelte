<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { currentProject } from "$lib/state/projects.svelte";
  import { slicesLoaded } from "$lib/state/slices.svelte";
  import {
    build,
    built,
    forgetOtherProject,
    groupLabels,
    isStale,
    loadSettings,
    selected,
    settings,
    treeMode,
    variants
  } from "$lib/state/tree.svelte";
  import BuildSettings from "$lib/components/projects/tree/build-settings.svelte";
  import Canvas from "$lib/components/projects/tree/canvas.svelte";
  import DetailPanel from "$lib/components/projects/tree/detail-panel.svelte";
  import GroupHeader from "$lib/components/projects/tree/group-header.svelte";
  import VariantPicker from "$lib/components/projects/tree/variant-picker.svelte";
  import ViewLegend from "$lib/components/projects/tree/view-legend.svelte";
  import VisualizationSettings from "$lib/components/projects/tree/visualization-settings.svelte";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Network from "@lucide/svelte/icons/network";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  const project = $derived(currentProject());
  const stale = $derived(isStale());
  /** What a build would produce right now — not what the drawn tree shows. */
  const mode = $derived(treeMode());
  const labels = $derived(groupLabels());

  /** The population a build would run over, named the way the views name it. */
  const buildScope = $derived(
    mode === "compare"
      ? `Compares ${labels.a.name} against ${labels.b?.name}.`
      : `Builds the tree over ${labels.a.name === "Whole log" ? "the whole log" : labels.a.name}.`
  );

  // An empty selection means two different things. Before the variant list has
  // loaded it means "never chosen", and the backend opens on the most common
  // variants — a perfectly good cold build. Once the list has loaded the
  // selection has been seeded, so empty can only mean the user cleared it, and
  // building would draw nothing.
  const noVariants = $derived(
    variants.key !== null && settings.value.selectedVariants.length === 0
  );

  let panelOpen = $state(false);
  let variantsOpen = $state(false);

  /** Everything loaded that a build reads, so a cold build is not premature. */
  const ready = $derived(
    project !== null &&
      slicesLoaded.projectId === project.id &&
      settings.projectId === project.id
  );

  /**
   * The first tree of a session builds itself. Only in the cold case: with a
   * tree already up, a stale one included, rebuilding is the user's call — the
   * banner says so — because a full scan per filter edit is the cost this
   * button exists to avoid. A failed build is not retried either, or the error
   * would loop.
   */
  $effect(() => {
    if (!project || !ready) return;
    if (built.tree || built.building || built.error || noVariants) return;
    build(project);
  });

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
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <!-- The size of what is on screen, and the control over it, first thing
           on the bar: the tree itself never says what it left out. Available
           before the first build too — the variant list doesn't need one. -->
      <VariantPicker {project} tree={built.tree} bind:open={variantsOpen} />
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
          disabled={built.building || noVariants}
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
              <!-- The panel says what differs at this node and stays beside the
                   tree; the distributions are a wall of histograms that wants
                   the whole window, so they get their own view rather than a
                   drawer squeezing the canvas from below. -->
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
          <DetailPanel tree={built.tree} nodeId={selected.id} onClose={() => (selected.id = null)} />
        {/if}
      </div>
    {:else}
      <!-- With the cold build automatic, this screen is the four cases where
           there is no tree and none is on its way: still building, a build
           that failed, a selection the user emptied, and the moment before
           the effect fires. Each says why rather than leaving a blank. -->
      <div class="bg-sidebar flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty.Root>
          <Empty.Header>
            <Empty.Media variant="icon">
              {#if built.building || !ready}
                <LoaderCircle class="animate-spin" />
              {:else if built.error}
                <TriangleAlert />
              {:else}
                <Network />
              {/if}
            </Empty.Media>
            <Empty.Title>
              {#if !ready}
                Loading
              {:else if built.building}
                Building the tree
              {:else if built.error}
                The build failed
              {:else if noVariants}
                No variants selected
              {:else}
                No tree built yet
              {/if}
            </Empty.Title>
            <Empty.Description>
              {#if !ready}
                <!-- Slices and settings decide what a build runs over, so
                     naming the scope before they land would name the wrong
                     one for a frame. -->
                Reading this project's slices and build settings…
              {:else if built.building}
                {buildScope} A full scan of the log, plus one Significance Test per node and
                attribute.
              {:else if built.error}
                {built.error}
              {:else if noVariants}
                Every variant is unchecked, so a build would draw nothing. Pick at least one.
              {:else}
                {buildScope}
                {#if mode === "base"}
                  No significance tests: there are no two populations to compare.
                {:else if mode === "single"}
                  One group, so nodes carry its case counts without a comparison.
                {/if}
              {/if}
            </Empty.Description>
          </Empty.Header>
          {#if ready && !built.building}
            <Empty.Content>
              {#if noVariants}
                <Button onclick={() => (variantsOpen = true)}>Choose variants</Button>
              {:else}
                <Button onclick={() => build(project)}>
                  {#if built.error}
                    <RefreshCw data-icon="inline-start" />
                    Retry
                  {:else}
                    <Play data-icon="inline-start" />
                    Build tree
                  {/if}
                </Button>
              {/if}
            </Empty.Content>
          {/if}
        </Empty.Root>
      </div>
    {/if}
  </div>
{/if}
