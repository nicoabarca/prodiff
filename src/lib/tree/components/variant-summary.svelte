<script lang="ts">
  /** What the tree on screen is made of, and the way into the Variants panel. */
  import { formatNumber } from "$lib/format";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { selectedVariants, settings, variants, view } from "$lib/tree/state/tree.svelte";
  import { totalCases, visibleNodes } from "$lib/tree/utils/tree";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import Route from "@lucide/svelte/icons/route";

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
    <span class="text-muted-foreground font-normal">selected · no tree yet</span>
  {:else}
    Select variants
  {/if}
</SettingField>
