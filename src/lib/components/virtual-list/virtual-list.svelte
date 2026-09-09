<script lang="ts" generics="T">
  /**
   * A scrolling list that only renders what is on screen; the windowing arithmetic
   * lives in `virtualRange`.
   *
   * `rowHeight` is what a row measures, in pixels: one number for rows that are
   * all the same, or one entry per item for rows that are not. A row that
   * disagrees with the number given for it drifts out of place as the list
   * scrolls.
   */
  import { virtualRange } from "$lib/components/virtual-list/virtual.svelte";
  import type { Snippet } from "svelte";

  let {
    items,
    rowHeight,
    row,
    empty,
    class: className = ""
  }: {
    items: T[];
    rowHeight: number | number[];
    row: Snippet<[T, number]>;
    empty?: Snippet;
    class?: string;
  } = $props();

  const range = virtualRange({ count: () => items.length, rowHeight: () => rowHeight });

  const heightOf = (index: number) =>
    Array.isArray(rowHeight) ? (rowHeight[index] ?? 0) : rowHeight;
</script>

<div
  class="min-h-0 flex-1 overflow-y-auto {className}"
  onscroll={range.onScroll}
  bind:clientHeight={() => 0, (height) => range.setViewport(height)}
>
  {#if items.length === 0 && empty}
    {@render empty()}
  {:else}
    <div style:height="{range.padTop}px"></div>
    {#each items.slice(range.start, range.end) as item, offset (range.start + offset)}
      <div style:height="{heightOf(range.start + offset)}px">
        {@render row(item, range.start + offset)}
      </div>
    {/each}
    <div style:height="{range.padBottom}px"></div>
  {/if}
</div>
