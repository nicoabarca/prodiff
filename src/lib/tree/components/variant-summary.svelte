<script lang="ts">
  /** What the tree on screen is made of, and the way into the Variants panel. */
  import { formatNumber } from "$lib/format";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { selectedVariants, settings, variants, view } from "$lib/tree/state/tree.svelte";
  import { totalCases, visibleNodes } from "$lib/tree/utils/tree";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    tree,
    open,
    onToggle
  }: { tree: ResponseDirectedTree | null; open: boolean; onToggle: () => void } = $props();

  /** The tree on screen, not the pending selection. */
  const onScreen = $derived.by(() => {
    if (!tree) return null;
    const visible = visibleNodes(tree, view, selectedVariants());
    const total = totalCases(tree);
    return {
      variantsShown: visible.variantsShown,
      variantsTotal: tree.variantsTotal,
      casesShown: visible.casesShown,
      total,
      share: total > 0 ? Math.round((visible.casesShown / total) * 100) : 0
    };
  });

  const selected = $derived(settings.value.selectedVariants.length);
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
      <span class="text-muted-foreground text-[0.625rem]">No tree built yet</span>
    {:else}
      <span class="text-base leading-none font-semibold">Select variants</span>
    {/if}
  </span>
  <ChevronDown
    class="text-muted-foreground size-4 shrink-0 transition-transform {open ? 'rotate-180' : ''}"
  />
</button>
