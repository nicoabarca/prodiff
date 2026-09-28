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
  import AttributePrompt from "$lib/tree/components/attribute-prompt.svelte";
  import Canvas from "$lib/tree/components/canvas.svelte";
  import DetailPanel from "$lib/tree/components/detail-panel.svelte";
  import CaseStrip from "$lib/tree/components/case-strip.svelte";
  import TreeToolbar from "$lib/tree/components/tree-toolbar.svelte";
  import VariantPanel from "$lib/tree/components/variant-panel.svelte";
  import ViewLegend from "$lib/tree/components/view-legend.svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Network from "@lucide/svelte/icons/network";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Play from "@lucide/svelte/icons/play";
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
    <TreeToolbar
      {project}
      tree={built.tree}
      error={built.error}
      bind:variantsOpen
      bind:buildSettingsOpen
      bind:comparing
    />
    <AttributePrompt {project} />

    {#if built.tree}
      <CaseStrip tree={built.tree} />
    {/if}

    <div class="flex min-h-0 flex-1">
      {#if built.tree && variantsOpen}
        <VariantPanel {project} tree={built.tree} onClose={() => (variantsOpen = false)} />
      {/if}

      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {#if built.tree}
          <div class="flex min-h-0 flex-1">
            <div class="relative flex min-h-0 min-w-0 flex-1" data-tour="tree-canvas">
              <Canvas tree={built.tree} />
              <ViewLegend />
              {#if import.meta.env.DEV}
                {#await import("$lib/devtools/tree/components/tree-inspector.svelte") then { default: TreeInspector }}
                  <TreeInspector tree={built.tree} />
                {/await}
              {/if}
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
                <Button
                  variant="outline"
                  size="sm"
                  class="bg-background/90 absolute top-3 right-3 z-10 backdrop-blur"
                  aria-pressed={panelOpen}
                  onclick={() => (panelOpen = !panelOpen)}
                >
                  <PanelRight data-icon="inline-start" />
                  {panelOpen ? "Hide" : "Show"} differences panel
                </Button>
              {/if}
            </div>
            {#if panelOpen}
              <DetailPanel
                tree={built.tree}
                nodeId={selected.id}
                distributionsHref="/app/projects/{project.id}/distributions"
                onClose={() => (selected.id = null)}
                onCompare={() => (comparing = true)}
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
