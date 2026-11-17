<script lang="ts">
  /**
   * What a node's figure is, in words: in full for the legend, or `short` for
   * the toolbar. A column's name sits in a chip; a derived attribute reads as
   * part of the sentence.
   */
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import type { Statistic } from "$lib/tree/types";
  import type { NodeFigure } from "$lib/tree/utils/figure";

  let {
    figure,
    statistic,
    short = false
  }: { figure: NodeFigure; statistic: Statistic; short?: boolean } = $props();

  const stat = $derived(statistic === "median" ? "Median" : "Mean");
</script>

{#snippet chip(name: string)}
  <span
    class="bg-muted border-border inline-block max-w-40 truncate border px-1 align-bottom font-mono text-[0.9em] font-medium"
  >
    <AttributeName {name} />
  </span>
{/snippet}

{#if figure.kind === "cases"}
  {short ? "Cases" : "Cases at this step"}
{:else if figure.kind === "share"}
  {short ? "% of group" : "Share of the group's cases"}
{:else if figure.kind === "category"}
  <span>{short ? "%" : "Cases with"} {@render chip(figure.name)} = {figure.value}</span>
{:else if isDurationAttribute(figure.name)}
  {stat}
  {attributeLabel(figure.name).toLowerCase()}
{:else}
  <span>{stat} {@render chip(figure.name)}</span>
{/if}
