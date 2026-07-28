<script lang="ts">
  /**
   * How much of the tree to draw, as a count of Variants. Dragging prunes
   * locally for an instant preview; releasing rebuilds, because the Node
   * Aggregates and Significance Tests are computed over the Variants included
   * and would otherwise keep describing the ones just cut away.
   */
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { build, built, view } from "$lib/state/tree.svelte";
  import { formatNumber } from "$lib/format";
  import { totalCases, visibleNodes, type DirectedTree } from "$lib/tree";
  import type { Project } from "$lib/types";

  let { tree, project }: { tree: DirectedTree; project: Project } = $props();

  // The whole log's Variants, not the built tree's: the build only ships the
  // ones asked for, so the leaves on hand are the floor, never the reach.
  const max = $derived(Math.max(tree.variantsTotal, tree.variantsIncluded));
  const visible = $derived(visibleNodes(tree, view));
  const total = $derived(totalCases(tree));
  const share = $derived(total > 0 ? Math.round((visible.casesShown / total) * 100) : 0);

  function commit(value: number) {
    view.maxVariants = value;
    // Releasing on the count already built — a click on the thumb, or a drag
    // that came back — has nothing to recompute.
    if (value === tree.variantsIncluded) return;
    build(project);
  }
</script>

<div class="flex min-w-0 items-center gap-3">
  <div class="flex flex-col gap-0.5">
    <p class="flex items-baseline gap-2 whitespace-nowrap">
      <span class="text-base leading-none font-semibold tabular-nums">
        {formatNumber(visible.variantsShown)} of {formatNumber(tree.variantsTotal)} variants
      </span>
      <span class="text-muted-foreground text-xs tabular-nums">{share}% of cases</span>
    </p>
    <p class="text-muted-foreground text-[0.625rem]">
      {formatNumber(visible.casesShown)} of {formatNumber(total)} cases on screen
    </p>
  </div>
  <Slider
    type="single"
    min={1}
    {max}
    step={1}
    disabled={built.building}
    value={Math.min(view.maxVariants, max)}
    onValueChange={(value) => (view.maxVariants = value)}
    onValueCommit={commit}
    class="w-40 shrink-0"
    aria-label="Variants shown"
  />
</div>
