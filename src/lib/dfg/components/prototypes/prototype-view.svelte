<script lang="ts">
  /**
   * The DFG view with one tests panel prototype on its side, otherwise the same
   * toolbar, canvas and Variants panel as the Directly-Follows Graph route.
   */
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import DfgToolbar from "$lib/dfg/components/dfg-toolbar.svelte";
  import SplitCanvas from "$lib/dfg/components/split-canvas.svelte";
  import VariantPanel from "$lib/dfg/components/variant-panel.svelte";
  import TestsPanelA from "$lib/dfg/components/prototypes/tests-panel-a.svelte";
  import TestsPanelB from "$lib/dfg/components/prototypes/tests-panel-b.svelte";
  import TestsPanelC from "$lib/dfg/components/prototypes/tests-panel-c.svelte";
  import { built, forgetOtherProject, isStale, load } from "$lib/dfg/state/dfg.svelte";
  import { clearFocus, focused, litIds } from "$lib/dfg/state/prototypes/focus.svelte";
  import { refit, selected, splitting, view } from "$lib/dfg/state/view.svelte";
  import {
    loadSettings as loadVariantSettings,
    settings as variantSettings
  } from "$lib/dfg/state/variants.svelte";
  import { graphFindings, placeIds } from "$lib/dfg/utils/prototypes/findings";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { graphGroups } from "$lib/dfg/utils/groups";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { comparedGroups, comparison, loadComparison } from "$lib/groups/state/comparison.svelte";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  let { variant }: { variant: "a" | "b" | "c" } = $props();

  const project = $derived(currentProject());
  const stale = $derived(isStale(project));
  const split = $derived(splitting(comparedGroups().length));
  const graphGroupsForView = $derived(
    built.graph && project ? graphGroups(built.graph, project.id) : []
  );
  const simplified = $derived(built.graph ? simplify(built.graph, view) : null);
  const findings = $derived(
    built.graph && simplified ? graphFindings(built.graph, simplified) : []
  );
  const comparable = $derived(graphGroupsForView.length > 1);

  /** Each Group's cases across the Variants the graph was built from. */
  const totals = $derived(
    Object.fromEntries(
      graphGroupsForView.map((group) => [
        group.id,
        (built.graph?.variants ?? []).reduce((sum, v) => sum + (v.cases[group.id] ?? 0), 0)
      ])
    )
  );

  const lit = $derived(litIds(focused.place));
  const frameOn = $derived({
    ids: focused.place ? placeIds(focused.place) : [],
    at: focused.at
  });

  let comparing = $state(false);
  let variantsOpen = $state(false);
  let buildSettingsOpen = $state(false);
  let panelOpen = $state(untrack(() => variant) !== "a");

  // A opens on a selection; B and C stay open on their own. A click on the
  // canvas drops a lit place it no longer points at.
  $effect(() => {
    const id = selected.id;
    untrack(() => {
      if (variant === "a") panelOpen = id !== null;
      const place = focused.place;
      if (place && !(place.kind === "node" && place.id === id)) clearFocus();
    });
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

  $effect(() => () => clearFocus());
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
              spotlight={lit}
              {frameOn}
            />
          {/if}
          <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
            <span
              class="bg-background/90 border-border flex h-7 items-center gap-1.5 border px-2 text-[0.6875rem] font-medium backdrop-blur"
            >
              <FlaskConical class="size-3.5" aria-hidden="true" />
              Prototype {variant.toUpperCase()}
            </span>
            {#if variant !== "a" || selected.id !== null}
              <Button
                variant="outline"
                size="sm"
                class="bg-background/90 backdrop-blur"
                aria-pressed={panelOpen}
                onclick={() => (panelOpen = !panelOpen)}
              >
                <PanelRight data-icon="inline-start" />
                {panelOpen ? "Hide" : "Show"} tests
              </Button>
            {/if}
          </div>
        </div>
        {#if panelOpen}
          {#if !comparable}
            <aside
              class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col items-start gap-2.5 border-l p-4"
            >
              <p class="text-muted-foreground text-xs">
                One-group mode: there is nothing to test against. Compare two groups to see where
                they differ.
              </p>
              <Button size="sm" onclick={() => (comparing = true)}>Choose a second group</Button>
            </aside>
          {:else if findings.length === 0}
            <aside
              class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col items-start gap-2.5 border-l p-4"
            >
              <p class="text-muted-foreground text-xs">
                No attributes are tested. Choose some to see where the groups differ.
              </p>
              <Button variant="outline" size="sm" onclick={() => (buildSettingsOpen = true)}>
                Choose attributes
              </Button>
            </aside>
          {:else if variant === "a"}
            <TestsPanelA
              {simplified}
              groups={graphGroupsForView}
              {findings}
              {totals}
              onClose={() => (panelOpen = false)}
            />
          {:else if variant === "b"}
            <TestsPanelB {findings} onClose={() => (panelOpen = false)} />
          {:else}
            <TestsPanelC {simplified} {findings} onClose={() => (panelOpen = false)} />
          {/if}
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
