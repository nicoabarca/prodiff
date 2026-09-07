<script lang="ts">
  /**
   * The sample rows of the uploaded file, as both wizard steps draw them: a
   * sticky header, a sticky row-number column and zebra rows. What a header
   * cell holds and how a column reacts to the pointer is the caller's.
   */
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  import * as Table from "$lib/components/ui/table/index.js";

  let {
    columns,
    rows,
    head,
    headClass,
    cellClass,
    onColumnClick,
    onColumnEnter,
    onColumnLeave
  }: {
    columns: { name: string }[];
    rows: string[][];
    head?: Snippet<[{ name: string; index: number }]>;
    headClass?: (index: number) => string;
    cellClass?: (index: number) => string;
    onColumnClick?: (index: number) => void;
    onColumnEnter?: (index: number) => void;
    onColumnLeave?: (index: number) => void;
  } = $props();
</script>

<div class="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col border">
  <div class="persistent-scrollbars min-h-0 flex-1 overflow-x-scroll overflow-y-auto">
    <!-- Table.Root owns a nested scroller, so this table uses the outer bounded scroller. -->
    <table class="w-max min-w-full caption-bottom border-separate border-spacing-0 text-xs">
      <Table.Header class="sticky top-0 z-10">
        <Table.Row class="hover:bg-transparent">
          <Table.Head
            class="border-border bg-card text-muted-foreground sticky left-0 z-20 h-auto border-r border-b px-2 py-1 text-right font-mono text-xs font-normal"
          >
            #
          </Table.Head>
          {#each columns as { name }, index (name)}
            <Table.Head
              class={cn(
                "border-border h-auto border-r border-b px-3 py-1 font-mono text-xs font-normal",
                headClass?.(index)
              )}
            >
              {#if head}
                {@render head({ name, index })}
              {:else}
                {name}
              {/if}
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each rows as row, rowIndex}
          <Table.Row
            class={cn("hover:bg-transparent", rowIndex % 2 === 1 ? "bg-muted/40" : "bg-card")}
          >
            <Table.Cell
              class="border-border text-muted-foreground sticky left-0 z-10 border-r border-b bg-inherit px-2 py-0.5 text-right font-mono text-xs"
            >
              {rowIndex + 1}
            </Table.Cell>
            {#each row as cell, columnIndex}
              <Table.Cell
                onclick={() => onColumnClick?.(columnIndex)}
                onmouseenter={() => onColumnEnter?.(columnIndex)}
                onmouseleave={() => onColumnLeave?.(columnIndex)}
                class={cn(
                  "border-border border-r border-b px-3 py-0.5 font-mono text-xs whitespace-nowrap transition-colors",
                  cellClass?.(columnIndex)
                )}
              >
                {cell}
              </Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </table>
  </div>
</div>
