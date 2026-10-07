<script lang="ts">
  /**
   * The same graph twice, one Group to a panel. Both panels are cut by the one
   * pair of sliders in the toolbar and laid out from that whole cut, so an
   * activity sits at the same coordinates on either side, and they share one
   * viewport, so panning or zooming either moves both.
   */
  import Canvas from "$lib/dfg/components/canvas.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import type { FaceGroup } from "$lib/dfg/types";
  import { refit } from "$lib/dfg/state/view.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Viewport } from "@xyflow/svelte";

  let {
    graph,
    simplified,
    groups,
    stale
  }: {
    graph: ResponseDfg;
    simplified: Simplified;
    groups: FaceGroup[];
    stale: boolean;
  } = $props();

  let viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 });

  const totals = $derived(
    new Map(
      groups.map((group) => [
        group.id,
        simplified.nodes
          .filter((node) => node.kind === "start")
          .reduce((sum, node) => sum + (node.counts[group.id]?.cases ?? 0), 0)
      ])
    )
  );
  const allCases = $derived([...totals.values()].reduce((sum, count) => sum + count, 0));

  const share = (id: string) =>
    allCases > 0 ? Math.round(((totals.get(id) ?? 0) / allCases) * 100) : 0;
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

<div class="flex min-h-0 min-w-0 flex-1">
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
            {simplified}
            {groups}
            {stale}
            focus={groups[0].id}
            layoutFrom={simplified}
            refitAt={refit.at}
            bind:viewport
            exportName="directly-follows-graph-{groups[0].name}"
          />
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
            {simplified}
            {groups}
            {stale}
            focus={groups[1].id}
            layoutFrom={simplified}
            fits={false}
            bind:viewport
            exportName="directly-follows-graph-{groups[1].name}"
          />
        </div>
      </div>
    {/if}
  </div>
</div>
