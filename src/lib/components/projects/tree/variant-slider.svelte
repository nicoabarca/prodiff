<script lang="ts">
  /**
   * How much of the tree to draw, as a count of Variants. Dragging only prunes
   * what is already in memory — building is the one expensive thing in the app
   * and stays on the button. Until the next build the Node Aggregates and
   * Significance Tests still describe the Variants the tree was built with, so
   * moving this marks the tree stale rather than silently recomputing.
   */
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { view } from "$lib/state/tree.svelte";
  import { formatNumber } from "$lib/format";
  import { totalCases, visibleNodes, type DirectedTree } from "$lib/tree";

  let { tree }: { tree: DirectedTree } = $props();

  // The whole log's Variants, not the built tree's: the build only ships the
  // ones asked for, so the leaves on hand are the floor, never the reach.
  // Dragging past them asks the next build for more.
  const max = $derived(Math.max(tree.variantsTotal, tree.variantsIncluded));
  const visible = $derived(visibleNodes(tree, view));
  const total = $derived(totalCases(tree));
  const share = $derived(total > 0 ? Math.round((visible.casesShown / total) * 100) : 0);
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
    value={Math.min(view.maxVariants, max)}
    onValueChange={(value) => (view.maxVariants = value)}
    class="w-40 shrink-0"
    aria-label="Variants shown"
  />
</div>
