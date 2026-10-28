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

  /** What the built graph is made of, which is every Variant it draws. */
  const onScreen = $derived.by(() => {
    if (!simplified) return null;
    const { count, cases } = simplified.variants;
    const all = logCases || cases;
    return {
      variantsShown: count,
      variantsTotal: variants.rows.length || count,
      casesShown: cases,
      total: all,
      share: all > 0 ? Math.round((cases / all) * 100) : 0
    };
  });
</script>

<div data-tour="dfg-variants" class="flex shrink-0">
  <VariantSummary
    {onScreen}
    selected={selectedVariants().size}
    known={variants.rows.length}
    noun="graph"
    {open}
    {onToggle}
  />
</div>
