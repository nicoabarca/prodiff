<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import DetailPanel from "$lib/dfg/components/detail-panel.svelte";
  import Settings from "$lib/dfg/components/settings.svelte";
  import { built, forgetOtherProject, isStale, load } from "$lib/dfg/state/dfg.svelte";
  import { selected } from "$lib/dfg/state/view.svelte";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { comparedGroups, comparison, loadComparison } from "$lib/groups/state/comparison.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import CompareDialog from "$lib/tree/components/compare-dialog.svelte";
  import GitCompare from "@lucide/svelte/icons/git-compare";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  const project = $derived(currentProject());
  const groups = $derived(comparedGroups());
  const stale = $derived(isStale());

  let comparing = $state(false);
  let panelOpen = $state(false);
  $effect(() => {
    panelOpen = selected.id !== null;
  });

  $effect(() => {
    if (!project) return;
    forgetOtherProject(project.id);
    if (comparison.projectId !== project.id) loadComparison(project.id);
  });

  // Unlike the tree, the graph builds itself: nothing about it is a decision the
  // user has to commit to first, and the simplification is all on this side.
  $effect(() => {
    if (project && groupsLoaded.projectId === project.id) load(project);
  });
</script>

{#if project}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
      {#if built.graph}
        <p class="text-muted-foreground text-xs">
          {built.graph.nodes.length - 2} activities · {built.graph.edges.length} paths
          {#if built.graph.overlapCases > 0}
            · {built.graph.overlapCases} cases in both groups
          {/if}
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

    {#if built.graph}
      <div class="flex min-h-0 flex-1">
        <div class="relative flex min-h-0 flex-1">
          <Canvas graph={built.graph} {stale} />
          {#if selected.id !== null}
            <div class="absolute top-3 right-3 z-10">
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
            <DetailPanel graph={built.graph} />
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
