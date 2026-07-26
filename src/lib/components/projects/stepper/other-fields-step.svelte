<script lang="ts">
  import type { ColumnType } from "$lib/column-mapping";
  import type { AssignableRole } from "$lib/projects/roles";
  import { columnHeaderClass, columnCellClass } from "$lib/projects/column-highlight";
  import * as Table from "$lib/components/ui/table/index.js";
  import Lock from "@lucide/svelte/icons/lock";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import Info from "@lucide/svelte/icons/info";

  let {
    columns,
    rows,
    roleByColumn,
    visibleColumns = $bindable(),
    hoveredCol = $bindable()
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    roleByColumn: Record<string, AssignableRole>;
    visibleColumns: Set<string>;
    hoveredCol: number | null;
  } = $props();

  function toggleColumn(col: string) {
    if (roleByColumn[col]) return;
    const next = new Set(visibleColumns);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    visibleColumns = next;
  }

  function setHoveredCol(i: number) {
    hoveredCol = i;
  }

  function clearHoveredCol(i: number) {
    if (hoveredCol === i) hoveredCol = null;
  }
</script>

<div class="border-primary bg-primary/5 mb-5 flex shrink-0 items-center gap-3 border-l-4 px-4 py-3">
  <MousePointerClick class="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
  <p class="text-foreground text-base font-medium text-pretty">
    Click extra columns to include them in your analysis.
  </p>
</div>

<div class="border-border bg-card mb-5 flex shrink-0 items-center gap-3 border px-4 py-2">
  <Info class="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
  <p class="text-muted-foreground text-xs">
    Hidden columns aren't lost — you'll be able to toggle them back to visible later from the
    project's settings.
  </p>
</div>

<div class="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col border">
  <div class="border-border flex shrink-0 items-center justify-between border-b px-4 py-2">
    <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
      >Sample preview</span
    >
    <span class="text-muted-foreground text-xs">First {rows.length} rows</span>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <Table.Root class="w-max min-w-full border-collapse">
      <Table.Header class="sticky top-0 z-10">
        <Table.Row class="hover:bg-transparent">
          {#each columns as { name: col }, c}
            {@const locked = !!roleByColumn[col]}
            {@const selected = visibleColumns.has(col)}
            <Table.Head class="p-0">
              <button
                type="button"
                disabled={locked}
                onclick={() => toggleColumn(col)}
                onmouseenter={() => setHoveredCol(c)}
                onmouseleave={() => clearHoveredCol(c)}
                class={`border-border flex w-full items-center gap-2 border-b px-3 py-2 text-left font-mono text-xs whitespace-nowrap transition-colors ${columnHeaderClass(
                  locked,
                  selected,
                  hoveredCol === c
                )}`}
              >
                {#if locked}
                  <Lock class="h-3 w-3 shrink-0" aria-hidden="true" />
                {/if}
                <span>{col}</span>
              </button>
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each rows as row}
          <Table.Row class="hover:bg-transparent">
            {#each row as cell, j}
              {@const colName = columns[j].name}
              {@const locked = !!roleByColumn[colName]}
              {@const selected = visibleColumns.has(colName)}
              <Table.Cell
                onclick={() => toggleColumn(colName)}
                onmouseenter={() => setHoveredCol(j)}
                onmouseleave={() => clearHoveredCol(j)}
                class={`px-3 py-1.5 font-mono text-xs whitespace-nowrap transition-colors ${columnCellClass(
                  locked,
                  selected,
                  hoveredCol === j
                )}`}
              >
                {cell}
              </Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
