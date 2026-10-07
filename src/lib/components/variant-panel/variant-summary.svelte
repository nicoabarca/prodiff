<script lang="ts" module>
  /** What the view on screen is made of, counted by the view itself. */
  export interface VariantsOnScreen {
    variantsShown: number;
    variantsTotal: number;
    casesShown: number;
    total: number;
    share: number;
  }
</script>

<script lang="ts">
  /** What the view on screen is made of, and the way into the Variants panel. */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { formatNumber } from "$lib/format";
  import Route from "@lucide/svelte/icons/route";

  let {
    onScreen,
    selected,
    known,
    noun,
    open,
    onToggle
  }: {
    onScreen: VariantsOnScreen | null;
    selected: number;
    known: number;
    noun: "tree" | "graph";
    open: boolean;
    onToggle: () => void;
  } = $props();
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
    {#if known > 0}
      of {formatNumber(known)}
    {/if}
    <span class="text-muted-foreground font-normal">selected · no {noun} yet</span>
  {:else}
    Select variants
  {/if}
</SettingField>
