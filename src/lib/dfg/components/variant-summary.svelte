<script lang="ts">
  /** The shared Variants field, counting what the graph on screen is made of. */
  import VariantSummary from "$lib/components/variant-panel/variant-summary.svelte";
  import { selectedVariants, variants } from "$lib/dfg/state/variants.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let {
    simplified,
    open,
    onToggle
  }: { simplified: Simplified | null; open: boolean; onToggle: () => void } = $props();

  /** The graph on screen, not the pending selection. */
  const onScreen = $derived.by(() => {
    if (!simplified) return null;
    const { shown, total, cases, totalCases } = simplified.variants;
    return {
      variantsShown: shown,
      variantsTotal: variants.rows.length || total,
      casesShown: cases,
      total: totalCases,
      share: totalCases > 0 ? Math.round((cases / totalCases) * 100) : 0
    };
  });
</script>

<VariantSummary
  {onScreen}
  selected={selectedVariants().size}
  known={variants.rows.length}
  noun="graph"
  {open}
  {onToggle}
/>
