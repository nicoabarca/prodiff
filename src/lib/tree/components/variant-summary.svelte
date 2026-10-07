<script lang="ts">
  /** The shared Variants field, counting what the tree on screen is made of. */
  import VariantSummary from "$lib/components/variant-panel/variant-summary.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { selectedVariants, settings, variants, view } from "$lib/tree/state/tree.svelte";
  import { totalCases, visibleNodes } from "$lib/tree/utils/tree";

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
</script>

<VariantSummary
  {onScreen}
  selected={settings.value.selectedVariants.length}
  known={variants.rows.length}
  noun="tree"
  {open}
  {onToggle}
/>
