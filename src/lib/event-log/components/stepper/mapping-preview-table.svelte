<script lang="ts">
  import type { ColumnType } from "$lib/event-log/invokers/types";
  import type { AssignableRole, ColumnPick } from "$lib/event-log/utils/roles";
  import {
    columnCellClass,
    columnHeaderClass,
    type ColumnPickState
  } from "$lib/event-log/utils/column-highlight";
  import { cn } from "$lib/utils";
  import PreviewTable from "./preview-table.svelte";
  import PreviewColumnLabel from "./preview-column-label.svelte";

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

  function selectColumn(index: number) {
    const column = columns[index].name;
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

<PreviewTable
  {columns}
  {rows}
  headClass={() => "p-0"}
  cellClass={(index) => columnCellClass(pickState(columns[index].name), hoveredCol === index)}
  onColumnClick={selectColumn}
  onColumnEnter={(index) => (hoveredCol = index)}
  onColumnLeave={clearHover}
>
  {#snippet head({ name, index })}
    {@const state = pickState(name)}
    <button
      type="button"
      onclick={() => selectColumn(index)}
      onmouseenter={() => (hoveredCol = index)}
      onmouseleave={() => clearHover(index)}
      class={cn(
        "flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left font-mono text-xs whitespace-nowrap transition-colors",
        columnHeaderClass(state, hoveredCol === index)
      )}
    >
      <PreviewColumnLabel
        {name}
        pick={roleByColumn[name] ?? (state === "picked" ? "other" : null)}
      />
    </button>
  {/snippet}
</PreviewTable>
