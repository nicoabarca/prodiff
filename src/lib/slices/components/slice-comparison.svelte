<script lang="ts">
  import { sliceCases, sliceColor } from "$lib/slices/state/slices.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Slice } from "$lib/slices/types";

  let { slices }: { slices: Slice[] } = $props();

  /** Only slices whose chain has been measured can appear in the summary. */
  const measured = $derived(
    slices
      .map((slice) => ({ slice, cases: sliceCases(slice) }))
      .filter((entry): entry is { slice: Slice; cases: number } => entry.cases !== null)
  );
</script>

{#if measured.length >= 2}
  <div
    class="border-border bg-background flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2"
  >
    <span class="text-muted-foreground text-[0.625rem] font-bold tracking-widest uppercase">
      Comparison
    </span>

    {#each measured as entry, index (entry.slice.id)}
      {#if index > 0}
        <span class="text-muted-foreground text-xs">vs</span>
      {/if}
      <span class="flex items-center gap-1.5">
        <span
          class="size-2.5 shrink-0"
          style="background:{colorVar(sliceColor(entry.slice))}"
          aria-hidden="true"
        ></span>
        <span class="text-sm font-semibold" style="color:{colorVar(sliceColor(entry.slice))}">
          {entry.slice.name}
        </span>
        <span
          class="font-mono text-sm font-semibold"
          style="color:{colorVar(sliceColor(entry.slice))}"
        >
          ({formatNumber(entry.cases)})
        </span>
      </span>
    {/each}
  </div>
{/if}
