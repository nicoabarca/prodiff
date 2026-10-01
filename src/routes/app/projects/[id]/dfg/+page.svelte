<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import DetailPanel from "$lib/dfg/components/detail-panel.svelte";
  import DfgToolbar from "$lib/dfg/components/dfg-toolbar.svelte";
  import SplitCanvas from "$lib/dfg/components/split-canvas.svelte";
  import VariantPanel from "$lib/dfg/components/variant-panel.svelte";
  import { built, forgetOtherProject, isStale, load } from "$lib/dfg/state/dfg.svelte";
  import { refit, selected, splitting, view } from "$lib/dfg/state/view.svelte";
  import {
    loadSettings as loadVariantSettings,
    settings as variantSettings
  } from "$lib/dfg/state/variants.svelte";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { graphGroups } from "$lib/dfg/utils/groups";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { comparedGroups, comparison, loadComparison } from "$lib/groups/state/comparison.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  const project = $derived(currentProject());
  const stale = $derived(isStale(project));
  const split = $derived(splitting(comparedGroups().length));
  const graphGroupsForView = $derived(
    built.graph && project ? graphGroups(built.graph, project.id) : []
  );
  const simplified = $derived(built.graph ? simplify(built.graph, view) : null);

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
    if (comparison.projectId !== project.id) loadComparison(project.id);
    if (variantSettings.projectId !== project.id) loadVariantSettings(project.id);
  });

  $effect(() => {
    if (project && groupsLoaded.projectId === project.id) load(project);
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <DfgToolbar
      {project}
      graph={built.graph}
      {simplified}
      error={built.error}
      building={built.building}
      {stale}
      bind:variantsOpen
      bind:buildSettingsOpen
      bind:comparing
    />

    {#if built.graph && simplified}
      <div class="flex min-h-0 flex-1">
        {#if variantsOpen}
          <VariantPanel {project} {simplified} onClose={() => (variantsOpen = false)} />
        {/if}
        <div class="relative flex min-h-0 min-w-0 flex-1">
          {#if split}
            <SplitCanvas graph={built.graph} {simplified} groups={graphGroupsForView} {stale} />
          {:else}
            <Canvas
              graph={built.graph}
              {simplified}
              groups={graphGroupsForView}
              {stale}
              refitAt={refit.at}
            />
          {/if}
          {#if selected.id !== null}
            <div class="absolute top-4 left-4 z-10">
              <Button
                variant="outline"
                size="sm"
                class="bg-background/90 backdrop-blur"
                aria-pressed={panelOpen}
                onclick={() => (panelOpen = !panelOpen)}
              >
                <PanelRight data-icon="inline-start" />
                {panelOpen ? "Hide" : "Show"} panel
              </Button>
            </div>
          {/if}
        </div>
        {#if panelOpen}
          <div
            class="border-border bg-background w-80 shrink-0 border-l"
            data-tour="dfg-detail-panel"
          >
            <DetailPanel graph={built.graph} {simplified} groups={graphGroupsForView} />
          </div>
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
