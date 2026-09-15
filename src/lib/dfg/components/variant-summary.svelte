<script lang="ts">
  /** What the graph on screen is made of, and the way into the Variants panel. */
  import { formatNumber } from "$lib/format";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selectedVariants, variants } from "$lib/dfg/state/variants.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import { simplify } from "$lib/dfg/utils/simplify";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    graph,
    open,
    onToggle
  }: { graph: ResponseDfg | null; open: boolean; onToggle: () => void } = $props();

  /** The graph on screen, not the pending selection. */
  const onScreen = $derived.by(() => {
    if (!graph) return null;
    const simplified = simplify(graph, view);
    const total = variants.rows.length || simplified.variants.total;
    return {
      variantsShown: simplified.variants.shown,
      variantsTotal: total,
      casesShown: simplified.variants.cases,
      total: simplified.variants.totalCases,
      share:
        simplified.variants.totalCases > 0
          ? Math.round((simplified.variants.cases / simplified.variants.totalCases) * 100)
          : 0
    };
  });

  const selected = $derived(selectedVariants().size);
</script>

<button
  class="hover:bg-accent -mx-2 flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left"
  aria-pressed={open}
  onclick={onToggle}
>
  <span class="flex flex-col gap-0.5">
    {#if onScreen}
      <span class="flex items-baseline gap-2 whitespace-nowrap">
        <span class="text-base leading-none font-semibold tabular-nums">
          {formatNumber(onScreen.variantsShown)} of {formatNumber(onScreen.variantsTotal)} variants
        </span>
        <span class="text-muted-foreground text-xs tabular-nums">
          {onScreen.share}% of cases
        </span>
      </span>
      <span class="text-muted-foreground text-[0.625rem]">
        {formatNumber(onScreen.casesShown)} of {formatNumber(onScreen.total)} cases
      </span>
    {:else if selected > 0}
      <span class="text-base leading-none font-semibold tabular-nums">
        {formatNumber(selected)}
        {#if variants.rows.length > 0}
          of {formatNumber(variants.rows.length)}
        {/if}
        variants selected
      </span>
      <span class="text-muted-foreground text-[0.625rem]">No graph built yet</span>
    {:else}
      <span class="text-base leading-none font-semibold">Select variants</span>
    {/if}
  </span>
  <ChevronDown
    class="text-muted-foreground size-4 shrink-0 transition-transform {open ? 'rotate-180' : ''}"
  />
</button>
