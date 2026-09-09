<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import {
    autoBuild,
    build,
    built,
    forgetOtherProject,
    inputsReady,
    retryBuild
  } from "$lib/tree/state/build.svelte";
  import { loadSettings, selected, settings, variants } from "$lib/tree/state/tree.svelte";
  import { comparison, comparedGroups, loadComparison } from "$lib/groups/state/comparison.svelte";
  import BuildSettings from "$lib/tree/components/build-settings.svelte";
  import AttributePrompt from "$lib/tree/components/attribute-prompt.svelte";
  import Canvas from "$lib/tree/components/canvas.svelte";
  import CompareDialog from "$lib/groups/components/compare-dialog.svelte";
  import DetailPanel from "$lib/tree/components/detail-panel.svelte";
  import GroupHeader from "$lib/tree/components/group-header.svelte";
  import VariantPanel from "$lib/tree/components/variant-panel.svelte";
  import VariantSummary from "$lib/tree/components/variant-summary.svelte";
  import ViewLegend from "$lib/tree/components/view-legend.svelte";
  import VisualizationSettings from "$lib/tree/components/visualization-settings.svelte";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Network from "@lucide/svelte/icons/network";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Play from "@lucide/svelte/icons/play";
  import GitCompare from "@lucide/svelte/icons/git-compare";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  const project = $derived(currentProject());
  const groups = $derived(comparedGroups());

  // Empty before the variant list loads means "never chosen"; after it, "cleared".
  const noVariants = $derived(
    variants.key !== null && settings.value.selectedVariants.length === 0
  );

  // Nothing to offer until the first tree either lands or fails: the build is
  // already on its way.
  const awaitingFirstTree = $derived(
    !!project &&
      built.tree === null &&
      built.error === null &&
      (built.building || !inputsReady(project.id))
  );

  // The attribute prompt owns the screen until it is answered, and the tree it
  // asks for is the first one built.
  const choosingAttributes = $derived(
    !!project && settings.projectId === project.id && !settings.value.attributesChosen
  );

  let comparing = $state(false);
  let variantsOpen = $state(false);
  let buildSettingsOpen = $state(false);

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

  $effect(() => {
    if (project) autoBuild(project);
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <VariantSummary
        tree={built.tree}
        open={variantsOpen}
        onToggle={() => (variantsOpen = !variantsOpen)}
      />
      {#if built.error}
        <p class="text-destructive truncate text-xs">{built.error}</p>
      {/if}
      <div class="ml-auto flex items-center gap-2">
        <!-- Which groups the tree measures against, and what they share. -->
        <Button variant="outline" size="sm" onclick={() => (comparing = true)}>
          <GitCompare data-icon="inline-start" />
          {groups[1] ? `${groups[0].name} vs ${groups[1].name}` : groups[0].name}
        </Button>
        <BuildSettings {project} bind:open={buildSettingsOpen} />
        {#if built.tree}
          <VisualizationSettings tree={built.tree} />
        {/if}
      </div>
    </div>

    <CompareDialog {project} bind:open={comparing} />
    <AttributePrompt {project} />

    <div class="flex min-h-0 flex-1">
      {#if built.tree && variantsOpen}
        <VariantPanel {project} tree={built.tree} onClose={() => (variantsOpen = false)} />
      {/if}

      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {#if built.tree}
          <GroupHeader tree={built.tree} />
          <div class="flex min-h-0 flex-1">
            <div class="relative flex min-h-0 min-w-0 flex-1">
              <Canvas tree={built.tree} />
              <ViewLegend />
              {#if built.error && !built.building}
                <Button
                  variant="outline"
                  size="icon"
                  class="bg-background/90 absolute top-3 left-3 z-10 backdrop-blur"
                  aria-label="Build the tree again"
                  onclick={() => retryBuild(project)}
                >
                  <RotateCcw />
                </Button>
              {/if}
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
                onOpenBuildSettings={() => (buildSettingsOpen = true)}
              />
            {/if}
          </div>
        {:else if choosingAttributes}
          <div class="bg-sidebar min-h-0 flex-1"></div>
        {:else if awaitingFirstTree}
          <div
            class="bg-sidebar flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6"
          >
            <LoaderCircle class="text-muted-foreground size-8 animate-spin" aria-hidden="true" />
            <p class="text-muted-foreground text-sm">Building tree…</p>
          </div>
        {:else}
          <div class="bg-sidebar flex min-h-0 flex-1 items-center justify-center p-6">
            <Empty.Root>
              <Empty.Header>
                <Empty.Media variant="icon">
                  <Network />
                </Empty.Media>
                <Empty.Title>No tree built yet</Empty.Title>
              </Empty.Header>
              <Button
                disabled={built.building || !groups[0] || noVariants}
                title={noVariants ? "Select at least one variant" : undefined}
                onclick={() => build(project)}
              >
                {#if built.error}
                  <RotateCcw data-icon="inline-start" />
                  {built.building ? "Building…" : "Try again"}
                {:else}
                  <Play data-icon="inline-start" />
                  {built.building ? "Building…" : "Build tree"}
                {/if}
              </Button>
            </Empty.Root>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
