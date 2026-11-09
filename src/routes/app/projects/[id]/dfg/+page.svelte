<script lang="ts">
  import ComparisonRefused from "$lib/groups/components/comparison-refused.svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import CanvasCuts from "$lib/dfg/components/canvas-cuts.svelte";
  import DfgToolbar from "$lib/dfg/components/dfg-toolbar.svelte";
  import SplitCanvas from "$lib/dfg/components/split-canvas.svelte";
  import TestsPanel from "$lib/dfg/components/tests-panel.svelte";
  import CaseStrip from "$lib/tree/components/case-strip.svelte";
  import VariantPanel from "$lib/dfg/components/variant-panel.svelte";
  import { built, drawnGraph, forgetOtherProject, isStale, load } from "$lib/dfg/state/dfg.svelte";
  import { pointed, pointedPlace, refit, splitting, tests, view } from "$lib/dfg/state/view.svelte";
  import {
    cuts,
    loadSettings as loadVariantSettings,
    settings as variantSettings
  } from "$lib/dfg/state/variants.svelte";
  import { graphFindings, placeIds, placeLight } from "$lib/dfg/utils/findings";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { builtAttributes } from "$lib/dfg/utils/display";
  import ViewLegend from "$lib/dfg/components/view-legend.svelte";
  import { graphGroups } from "$lib/dfg/utils/groups";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import {
    comparedGroups,
    comparison,
    loadComparison,
    relationRefused
  } from "$lib/groups/state/comparison.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  const project = $derived(currentProject());
  const stale = $derived(isStale(project));
  const graph = $derived(drawnGraph());
  /** A preview is drawn in full: what it lacks is the tests, which the panel and the canvas say. */
  const dimmed = $derived(stale && built.preview === null);
  const split = $derived(splitting(comparedGroups().length));
  const graphGroupsForView = $derived(graph && project ? graphGroups(graph, project.id) : []);
  const simplified = $derived(
    graph
      ? simplify(graph, {
          share: cuts.paths / 100,
          groups: graph.groups.map((group) => group.id),
          measure: view.measure
        })
      : null
  );
  const findings = $derived(graph && simplified ? graphFindings(graph, simplified) : []);
  const frameOn = $derived({
    ids: pointed.place ? placeIds(pointed.place) : [],
    at: pointed.at
  });
  const spotlight = $derived.by(() => {
    const place = pointedPlace();
    return place ? placeLight(place) : null;
  });

  let comparing = $state(false);
  let variantsOpen = $state(false);
  let buildSettingsOpen = $state(false);

  $effect(() => {
    if (!project) return;
    forgetOtherProject(project.id);
    if (comparison.projectId !== project.id) loadComparison(project.id);
    if (variantSettings.projectId !== project.id) loadVariantSettings(project.id);
  });

  $effect(() => {
    if (
      project &&
      groupsLoaded.projectId === project.id &&
      comparison.projectId === project.id &&
      variantSettings.projectId === project.id
    ) {
      load(project);
    }
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <DfgToolbar
      {project}
      graph={built.graph}
      {simplified}
      {findings}
      error={built.error}
      building={built.building}
      {stale}
      bind:variantsOpen
      bind:buildSettingsOpen
      bind:comparing
    />

    {#if built.graph && !relationRefused()}
      <div class="shrink-0 transition-opacity {built.preview ? 'opacity-50' : ''}">
        <CaseStrip
          caseLevel={built.graph.caseLevel}
          groupIds={built.graph.groups.map((group) => group.id)}
        />
      </div>
    {/if}

    {#if relationRefused()}
      <ComparisonRefused {project} />
    {:else if graph && simplified}
      <div class="flex min-h-0 flex-1">
        {#if variantsOpen}
          <VariantPanel {project} {simplified} onClose={() => (variantsOpen = false)} />
        {/if}
        <div class="relative flex min-h-0 min-w-0 flex-1">
          {#if split}
            <SplitCanvas
              {graph}
              {simplified}
              {findings}
              groups={graphGroupsForView}
              stale={dimmed}
              {frameOn}
              {spotlight}
            />
          {:else}
            <Canvas
              {graph}
              {simplified}
              {findings}
              groups={graphGroupsForView}
              stale={dimmed}
              refitAt={refit.at}
              {frameOn}
              {spotlight}
            />
          {/if}
          <CanvasCuts {project} {simplified} groups={graph.groups.map((group) => group.id)} />
          <ViewLegend {graph} {findings} groups={graphGroupsForView} />
          {#if import.meta.env.DEV}
            {#await import("$lib/devtools/dfg/components/dfg-inspector.svelte") then { default: DfgInspector }}
              <DfgInspector {graph} {simplified} />
            {/await}
          {/if}
          {#if built.preview}
            <p
              class="bg-background/90 text-muted-foreground absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-sm"
            >
              <LoaderCircle class="size-3.5 animate-spin" />
              {built.testing ? "Calculating tests…" : "Building the graph…"}
            </p>
          {:else if built.building}
            <div
              class="bg-background/50 absolute inset-0 z-20 flex items-center justify-center backdrop-blur-xs"
            >
              <LoaderCircle
                class="text-muted-foreground size-8 animate-spin"
                aria-label="Building the graph"
              />
            </div>
          {/if}
        </div>
        {#if tests.open}
          <TestsPanel
            {findings}
            built={builtAttributes(graph)}
            calculating={built.preview !== null && built.testing}
            groupCount={graphGroupsForView.length}
            onClose={() => (tests.open = false)}
            onCompare={() => (comparing = true)}
            onChooseAttributes={() => (buildSettingsOpen = true)}
          />
        {/if}
      </div>
    {:else}
      <div class="bg-sidebar flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty.Root>
          <Empty.Header>
            <Empty.Media variant="icon">
              <Waypoints />
            </Empty.Media>
            <Empty.Title>
              {built.building ? "Building the graph…" : "No graph yet"}
            </Empty.Title>
            <Empty.Description>
              {#if built.error}
                {built.error}
              {:else if !groupsLoaded.projectId}
                Loading groups…
              {:else}
                The graph builds itself from the groups being compared.
              {/if}
            </Empty.Description>
          </Empty.Header>
        </Empty.Root>
      </div>
    {/if}
  </div>
{/if}
