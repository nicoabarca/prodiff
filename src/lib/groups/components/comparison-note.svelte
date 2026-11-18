<script lang="ts">
  /** The always-visible line saying what the comparison removed. Nothing when it removed nothing. */
  import Fit from "$lib/components/fit/fit.svelte";
  import { comparedGroups, relation } from "$lib/groups/state/comparison.svelte";
  import { comparisonSentence } from "$lib/groups/utils/comparison-note";
  import { cn } from "$lib/utils";

  let { class: className }: { class?: string } = $props();

  const sentence = $derived(comparisonSentence(comparedGroups(), relation.summary));
</script>

{#if sentence}
  <Fit text={sentence} class={cn("text-muted-foreground text-xs", className)} />
{/if}
