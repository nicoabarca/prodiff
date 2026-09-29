<script lang="ts">
  /** What the graph on screen is made of, and the way into the Variants panel. */
  import { formatNumber } from "$lib/format";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selectedVariants, variants } from "$lib/dfg/state/variants.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import { simplify } from "$lib/dfg/utils/simplify";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import Route from "@lucide/svelte/icons/route";

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

<SettingField
  icon={Route}
  caption="Variants"
  class="shrink-0"
  {open}
  aria-pressed={open}
  title={onScreen
    ? `${formatNumber(onScreen.casesShown)} of ${formatNumber(onScreen.total)} cases`
    : undefined}
  onclick={onToggle}
>
  {#if onScreen}
    {formatNumber(onScreen.variantsShown)} of {formatNumber(onScreen.variantsTotal)}
    <span class="text-muted-foreground font-normal">{onScreen.share}% of cases</span>
  {:else if selected > 0}
    {formatNumber(selected)}
    {#if variants.rows.length > 0}
      of {formatNumber(variants.rows.length)}
    {/if}
    <span class="text-muted-foreground font-normal">selected · no graph yet</span>
  {:else}
    Select variants
  {/if}
</SettingField>
