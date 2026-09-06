<script lang="ts">
  import type { ColumnType } from "$lib/event-log/invokers/types";
  import type { AssignableRole, ColumnPick } from "$lib/event-log/utils/roles";
  import { pickMeta } from "$lib/event-log/utils/roles";
  import {
    columnCellClass,
    columnHeaderClass,
    type ColumnPickState
  } from "$lib/event-log/utils/column-highlight";
  import { cn } from "$lib/utils";
  import * as Table from "$lib/components/ui/table/index.js";
  import CircleOff from "@lucide/svelte/icons/circle-off";

  let {
    columns,
    rows,
    assignments = $bindable(),
    activeRole = $bindable(),
    hoveredCol = $bindable(),
    visibleColumns = $bindable(),
    roleByColumn
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    assignments: Record<AssignableRole, string | null>;
    activeRole: ColumnPick | null;
    hoveredCol: number | null;
    visibleColumns: Set<string>;
    roleByColumn: Record<string, AssignableRole>;
  } = $props();

  function pickState(column: string): ColumnPickState {
    return roleByColumn[column] || visibleColumns.has(column) ? "picked" : "none";
  }

  function toggleExtra(column: string) {
    const next = new Set(visibleColumns);
    if (next.has(column)) next.delete(column);
    else next.add(column);
    visibleColumns = next;
  }

  function selectColumn(column: string) {
    const existing = roleByColumn[column];
    if (existing) {
      assignments = { ...assignments, [existing]: null };
      activeRole = existing;
      return;
    }
    if (!activeRole) return;
    if (activeRole === "other") {
      toggleExtra(column);
      return;
    }
    if (visibleColumns.has(column)) toggleExtra(column);
    assignments = { ...assignments, [activeRole]: column };
  }

  function clearHover(index: number) {
    if (hoveredCol === index) hoveredCol = null;
  }
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
          {#each columns as { name: column }, index}
            {@const role = roleByColumn[column]}
            {@const state = pickState(column)}
            <Table.Head class="border-border h-auto p-0">
              <button
                type="button"
                onclick={() => selectColumn(column)}
                onmouseenter={() => (hoveredCol = index)}
                onmouseleave={() => clearHover(index)}
                class={cn(
                  "border-border flex w-full cursor-pointer items-center gap-2 border-r border-b px-3 py-1 text-left font-mono text-xs whitespace-nowrap transition-colors",
                  columnHeaderClass(state, hoveredCol === index)
                )}
              >
                {#if role}
                  {@const HeaderIcon = pickMeta[role].icon}
                  <HeaderIcon class="size-3.5 shrink-0" aria-hidden="true" />
                {:else if state === "picked"}
                  {@const ExtraIcon = pickMeta.other.icon}
                  <ExtraIcon class="size-3.5 shrink-0" aria-hidden="true" />
                {:else}
                  <CircleOff class="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
                {/if}
                <span>{column}</span>
              </button>
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
              {@const column = columns[columnIndex].name}
              <Table.Cell
                onclick={() => selectColumn(column)}
                onmouseenter={() => (hoveredCol = columnIndex)}
                onmouseleave={() => clearHover(columnIndex)}
                class={cn(
                  "border-border border-r border-b px-3 py-0.5 font-mono text-xs whitespace-nowrap transition-colors",
                  columnCellClass(pickState(column), hoveredCol === columnIndex)
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
