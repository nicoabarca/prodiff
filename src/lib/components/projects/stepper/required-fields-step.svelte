<script lang="ts">
  import type { ColumnType } from "$lib/column-mapping";
  import { roleOrder, roleMeta, type AssignableRole } from "$lib/projects/roles";
  import { columnHeaderClass, columnCellClass } from "$lib/projects/column-highlight";
  import type { FormatInference } from "$lib/timestamp-format";
  import TimestampFormatField from "./timestamp-format-field.svelte";
  import * as Table from "$lib/components/ui/table/index.js";
  import Check from "@lucide/svelte/icons/check";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";

  let {
    fileName,
    columns,
    rows,
    assignments = $bindable(),
    activeRole = $bindable(),
    hoveredCol = $bindable(),
    roleByColumn,
    formatInference,
    columnValues,
    columnTimestampFormat = $bindable(),
    formatWarningAcknowledged = $bindable()
  }: {
    fileName: string;
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    assignments: Record<AssignableRole, string | null>;
    activeRole: AssignableRole | null;
    hoveredCol: number | null;
    roleByColumn: Record<string, AssignableRole>;
    formatInference: Record<string, FormatInference>;
    columnValues: (name: string) => string[];
    columnTimestampFormat: Record<string, string>;
    formatWarningAcknowledged: Record<string, boolean>;
  } = $props();

  // The two timestamp roles are the only ones whose declared type can carry a
  // format, so they are the only cards that grow one.
  const TIMESTAMP_ROLES: AssignableRole[] = ["complete_timestamp", "start_timestamp"];

  function setFormat(col: string, value: string) {
    columnTimestampFormat = { ...columnTimestampFormat, [col]: value };
  }

  function acknowledge(col: string) {
    formatWarningAcknowledged = { ...formatWarningAcknowledged, [col]: true };
  }

  function firstUnassigned(next: Record<AssignableRole, string | null>): AssignableRole | null {
    return roleOrder.find((r) => next[r] === null) ?? null;
  }

  function handleColumnClick(col: string) {
    const existing = roleByColumn[col];
    if (existing) {
      assignments = { ...assignments, [existing]: null };
      activeRole = existing;
      return;
    }
    if (!activeRole) return;
    const next = { ...assignments, [activeRole]: col };
    assignments = next;
    activeRole = firstUnassigned(next);
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
    Click the columns in <span class="font-mono">{fileName}</span> to assign the fields required.
  </p>
</div>

<div
  class={`mb-4 flex shrink-0 items-center gap-3 border px-4 py-3 text-sm ${
    activeRole
      ? roleMeta[activeRole].optional
        ? "border-primary/60 bg-primary/60 text-primary-foreground"
        : "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-card-foreground"
  }`}
>
  {#if activeRole}
    <span
      class="border-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold"
    >
      {roleMeta[activeRole].step}
    </span>
    <span class="text-pretty">
      <span class="font-semibold tracking-wide"
        >{roleMeta[activeRole].optional ? "(Optional) " : ""}Select the
        <span class="font-bold">{roleMeta[activeRole].label.toUpperCase()}</span> column</span
      >
      {" — "}
      {roleMeta[activeRole].hint}
    </span>
  {:else}
    <Check class="h-5 w-5 shrink-0" />
    <span class="font-semibold tracking-wide uppercase"
      >All required fields mapped — review the highlights, then continue</span
    >
  {/if}
</div>

<div class="border-border bg-border mb-4 grid shrink-0 grid-cols-1 gap-px border sm:grid-cols-4">
  {#each roleOrder as role}
    {@const col = assignments[role]}
    {@const showFormat = col !== null && TIMESTAMP_ROLES.includes(role)}
    <div
      class={`bg-card flex items-center gap-3 p-3 text-left ${activeRole === role ? "bg-accent" : ""}`}
    >
      <span
        class={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
          col
            ? "bg-primary text-primary-foreground border-transparent"
            : "border-border text-muted-foreground border"
        }`}
      >
        {roleMeta[role].step}
      </span>
      <span class="min-w-0">
        <span
          class="text-muted-foreground block text-[0.625rem] font-semibold tracking-widest uppercase"
        >
          {roleMeta[role].label}{roleMeta[role].optional ? " (optional)" : ""}
        </span>
        <span class="text-card-foreground block truncate font-mono text-sm">{col ?? "—"}</span>
      </span>
      {#if showFormat && col}
        <!--
          The column name is short and truncates anyway, so the format sits in
          the space it leaves rather than stacking underneath and making the two
          timestamp cards twice the height of the other two.
        -->
        <div class="ml-auto min-w-0 flex-1">
          <TimestampFormatField
            values={columnValues(col)}
            inference={formatInference[col]}
            pattern={columnTimestampFormat[col] ?? ""}
            acknowledged={formatWarningAcknowledged[col] ?? false}
            onPatternChange={(value) => setFormat(col, value)}
            onAcknowledge={() => acknowledge(col)}
          />
        </div>
      {/if}
    </div>
  {/each}
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
            {@const role = roleByColumn[col]}
            <Table.Head class="p-0">
              <button
                type="button"
                onclick={() => handleColumnClick(col)}
                onmouseenter={() => setHoveredCol(c)}
                onmouseleave={() => clearHoveredCol(c)}
                class={`border-border flex w-full items-center gap-2 border-b px-3 py-2 text-left font-mono text-xs whitespace-nowrap transition-colors ${columnHeaderClass(
                  false,
                  !!role,
                  hoveredCol === c
                )}`}
              >
                {#if role}
                  <span
                    class="border-primary-foreground flex h-4 w-4 shrink-0 items-center justify-center border text-[0.625rem] font-bold"
                  >
                    {roleMeta[role].step}
                  </span>
                {/if}
                <span class="flex flex-col">
                  <span>{col}</span>
                  {#if role}
                    <span class="text-[0.625rem] font-semibold tracking-wide uppercase opacity-90">
                      {roleMeta[role].label}
                    </span>
                  {/if}
                </span>
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
              {@const mapped = !!roleByColumn[colName]}
              <Table.Cell
                onclick={() => handleColumnClick(colName)}
                onmouseenter={() => setHoveredCol(j)}
                onmouseleave={() => clearHoveredCol(j)}
                class={`px-3 py-1.5 font-mono text-xs whitespace-nowrap transition-colors ${columnCellClass(
                  false,
                  mapped,
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
