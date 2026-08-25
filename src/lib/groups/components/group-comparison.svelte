<script lang="ts">
  import { groupCases } from "$lib/groups/state/groups.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  let { groups }: { groups: Group[] } = $props();

  /** Only Groups whose Filter List has been measured appear in the summary. */
  const measured = $derived(
    groups
      .map((group) => ({ group, cases: groupCases(group) }))
      .filter((entry): entry is { group: Group; cases: number } => entry.cases !== null)
  );
</script>

{#if measured.length >= 2}
  <div
    class="border-border bg-background flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2"
  >
    <span class="text-muted-foreground text-[0.625rem] font-bold tracking-widest uppercase">
      Comparison
    </span>

    {#each measured as entry, index (entry.group.id)}
      {#if index > 0}
        <span class="text-muted-foreground text-xs">vs</span>
      {/if}
      <span class="flex items-center gap-1.5">
        <span
          class="size-2.5 shrink-0"
          style="background:{colorVar(entry.group.color)}"
          aria-hidden="true"
        ></span>
        <span class="text-sm font-semibold" style="color:{colorVar(entry.group.color)}">
          {entry.group.name}
        </span>
        <span
          class="font-mono text-sm font-semibold"
          style="color:{colorVar(entry.group.color)}"
        >
          ({formatNumber(entry.cases)})
        </span>
      </span>
    {/each}
  </div>
{/if}
