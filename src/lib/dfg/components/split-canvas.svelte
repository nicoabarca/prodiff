<script lang="ts">
  /**
   * The same graph twice, one Group to a panel. While both sliders are synced
   * the panels hold one cut and one layout, so an activity sits at the same
   * coordinates on either side. Unsynced, each panel places what it alone
   * draws, and neither slider reaches across.
   */
  import { Toggle } from "$lib/components/ui/toggle/index.js";
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import SimplificationControls from "$lib/dfg/components/simplification-controls.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import type { FaceGroup } from "$lib/dfg/types";
  import {
    knobs,
    reframeBoth,
    refit,
    setCoverage,
    setPaths,
    view,
    widest
  } from "$lib/dfg/state/view.svelte";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { colorVar, formatNumber } from "$lib/format";
  import Link from "@lucide/svelte/icons/link";
  import Unlink from "@lucide/svelte/icons/unlink";

  let {
    graph,
    groups,
    stale
  }: {
    graph: ResponseDfg;
    groups: FaceGroup[];
    stale: boolean;
  } = $props();

  const left = $derived(simplify(graph, knobs("left")));
  const right = $derived(simplify(graph, knobs("right")));
  const union = $derived(simplify(graph, widest()));

  // Both sliders synced means both panels hold the same cut, which is the only
  // time one layout serves them both. Apart, each places what it alone draws.
  const aligned = $derived(view.syncCoverage && view.syncPaths);

  const totals = $derived(
    new Map(
      groups.map((group) => [
        group.id,
        union.nodes
          .filter((node) => node.kind === "start")
          .reduce((sum, node) => sum + (node.counts[group.id]?.cases ?? 0), 0)
      ])
    )
  );
  const allCases = $derived([...totals.values()].reduce((sum, count) => sum + count, 0));

  const share = (id: string) =>
    allCases > 0 ? Math.round(((totals.get(id) ?? 0) / allCases) * 100) : 0;

  // Each panel's knobs float over it but belong to this component, so neither
  // panel can measure the overlay that covers it.
  let leftKnobsWidth = $state(0);
  let rightKnobsWidth = $state(0);

  // The sync bar straddles the divider, so half of it covers each panel. Both
  // toggles carry the same width, which puts the gap between them on the
  // divider rather than wherever the longer label ends.
  let syncWidth = $state(0);
  const syncHalf = $derived(syncWidth / 2);
</script>

{#snippet header(group: FaceGroup)}
  <div class="border-border flex shrink-0 items-baseline gap-2 border-b px-3 py-1.5">
    <span
      class="size-2 shrink-0 self-center rounded-full"
      style="background:{colorVar(group.color)}"
      aria-hidden="true"
    ></span>
    <span class="truncate text-xs font-semibold">{group.name}</span>
    <span class="text-muted-foreground text-[0.625rem] tabular-nums">
      {formatNumber(totals.get(group.id) ?? 0)} cases · {share(group.id)}%
    </span>
  </div>
{/snippet}

<div class="relative flex min-h-0 min-w-0 flex-1">
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    {#if groups[0]}
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        style="box-shadow:inset 0 0.125rem 0 0 {colorVar(groups[0].color)}"
      >
        {@render header(groups[0])}
        <div class="relative flex min-h-0 min-w-0 flex-1">
          <Canvas
            {graph}
            simplified={left}
            {groups}
            {stale}
            focus={groups[0].id}
            layoutFrom={aligned ? union : null}
            knobs={false}
            insetLeft={leftKnobsWidth}
            insetRight={syncHalf}
            refitAt={refit.left}
            exportName="directly-follows-graph-{groups[0].name}"
          />
          <SimplificationControls simplified={left} side="left" bind:width={leftKnobsWidth} />
        </div>
      </div>
    {/if}
  </div>

  <div class="border-border flex min-h-0 min-w-0 flex-1 flex-col border-l">
    {#if groups[1]}
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        style="box-shadow:inset 0 0.125rem 0 0 {colorVar(groups[1].color)}"
      >
        {@render header(groups[1])}
        <div class="relative flex min-h-0 min-w-0 flex-1">
          <Canvas
            {graph}
            simplified={right}
            {groups}
            {stale}
            focus={groups[1].id}
            layoutFrom={aligned ? union : null}
            knobs={false}
            insetLeft={syncHalf}
            insetRight={rightKnobsWidth}
            refitAt={refit.right}
            exportName="directly-follows-graph-{groups[1].name}"
          />
          <SimplificationControls simplified={right} side="right" bind:width={rightKnobsWidth} />
        </div>
      </div>
    {/if}
  </div>

  <div
    bind:clientWidth={syncWidth}
    class="absolute top-10 left-1/2 z-10 flex -translate-x-1/2 gap-2"
  >
    <Toggle
      size="sm"
      variant="outline"
      class="bg-background/90 w-40 rounded-[0.5rem] text-xs backdrop-blur"
      pressed={view.syncCoverage}
      aria-label="Move both Behaviour sliders together"
      onPressedChange={(pressed) => {
        view.syncCoverage = pressed;
        if (pressed) setCoverage("left", view.coverage);
        else reframeBoth();
      }}
    >
      {#if view.syncCoverage}
        <Link data-icon="inline-start" />
      {:else}
        <Unlink data-icon="inline-start" class="text-muted-foreground" />
      {/if}
      Sync behaviour
    </Toggle>
    <Toggle
      size="sm"
      variant="outline"
      class="bg-background/90 w-40 rounded-[0.5rem] text-xs backdrop-blur"
      pressed={view.syncPaths}
      aria-label="Move both Paths sliders together"
      onPressedChange={(pressed) => {
        view.syncPaths = pressed;
        if (pressed) setPaths("left", view.paths);
        else reframeBoth();
      }}
    >
      {#if view.syncPaths}
        <Link data-icon="inline-start" />
      {:else}
        <Unlink data-icon="inline-start" class="text-muted-foreground" />
      {/if}
      Sync paths
    </Toggle>
  </div>
</div>
