<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import DetailPanel from "$lib/dfg/components/detail-panel.svelte";
  import Settings from "$lib/dfg/components/settings.svelte";
  import VariantPanel from "$lib/dfg/components/variant-panel.svelte";
  import VariantSummary from "$lib/dfg/components/variant-summary.svelte";
  import { built, forgetOtherProject, isStale, load } from "$lib/dfg/state/dfg.svelte";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import { loadSettings as loadVariantSettings, settings as variantSettings } from "$lib/dfg/state/variants.svelte";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { graphGroups } from "$lib/dfg/utils/groups";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { comparedGroups, comparison, loadComparison } from "$lib/groups/state/comparison.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import CompareDialog from "$lib/groups/components/compare-dialog.svelte";
  import GitCompare from "@lucide/svelte/icons/git-compare";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  const project = $derived(currentProject());
  const groups = $derived(comparedGroups());
  const stale = $derived(isStale(project));
  const graphGroupsForView = $derived(
    built.graph && project ? graphGroups(built.graph, project.id) : []
  );
  const simplified = $derived(built.graph ? simplify(built.graph, view) : null);

  let comparing = $state(false);
  let variantsOpen = $state(false);
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
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <VariantSummary
        graph={built.graph}
        open={variantsOpen}
        onToggle={() => (variantsOpen = !variantsOpen)}
      />
      {#if built.graph && built.graph.overlapCases > 0}
        <p class="text-muted-foreground text-xs">
          {built.graph.overlapCases} cases in both groups
        </p>
      {/if}
      {#if built.graph?.skippedCaseLevel.length}
        <p class="text-muted-foreground text-xs">
          Case-level attributes left out: {built.graph.skippedCaseLevel.join(", ")}
        </p>
      {/if}
      {#if stale && built.building}
        <p class="text-muted-foreground text-xs">Rebuilding…</p>
      {/if}
      {#if built.error}
        <p class="text-destructive truncate text-xs">{built.error}</p>
      {/if}

      <div class="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={() => (comparing = true)}>
          <GitCompare data-icon="inline-start" />
          {groups[1] ? `${groups[0].name} vs ${groups[1].name}` : groups[0].name}
        </Button>
        <Settings {project} />
      </div>
    </div>

    <CompareDialog {project} bind:open={comparing} />

    {#if built.graph && simplified}
      <div class="flex min-h-0 flex-1">
        {#if variantsOpen}
          <VariantPanel {project} graph={built.graph} onClose={() => (variantsOpen = false)} />
        {/if}
        <div class="relative flex min-h-0 min-w-0 flex-1">
          <Canvas graph={built.graph} {simplified} groups={graphGroupsForView} {stale} />
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
          <div class="border-border bg-background w-80 shrink-0 border-l">
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
