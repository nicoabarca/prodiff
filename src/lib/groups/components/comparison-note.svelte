<script lang="ts">
  /** The always-visible line saying what the comparison removed. Nothing when it removed nothing. */
  import { comparedGroups, relation } from "$lib/groups/state/comparison.svelte";
  import { comparisonSentence } from "$lib/groups/utils/comparison-note";
  import { cn } from "$lib/utils";

  let { class: className }: { class?: string } = $props();

  const sentence = $derived(comparisonSentence(comparedGroups(), relation.summary));
</script>

{#if sentence}
  <p class={cn("text-muted-foreground truncate text-xs", className)} title={sentence}>
    {sentence}
  </p>
{/if}
