<script lang="ts">
  /** The shared Variants field, counting what the graph on screen is built from. */
  import VariantSummary from "$lib/components/variant-panel/variant-summary.svelte";
  import { selectedVariants, variants } from "$lib/dfg/state/variants.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let {
    simplified,
    open,
    onToggle
  }: { simplified: Simplified | null; open: boolean; onToggle: () => void } = $props();

  const logCases = $derived(
    variants.rows.reduce(
      (sum, row) => sum + Object.values(row.cases).reduce((total, cases) => total + cases, 0),
      0
    )
  );

  /** The built graph's Variant selection; the Behaviour cut is the canvas's own count. */
  const onScreen = $derived.by(() => {
    if (!simplified) return null;
    const { total, totalCases } = simplified.variants;
    const all = logCases || totalCases;
    return {
      variantsShown: total,
      variantsTotal: variants.rows.length || total,
      casesShown: totalCases,
      total: all,
      share: all > 0 ? Math.round((totalCases / all) * 100) : 0
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
