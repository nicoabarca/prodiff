<script lang="ts">
  import type { ColumnType } from "$lib/event-log/invokers/types";
  import {
    pickOrder,
    pickMeta,
    type AssignableRole,
    type ColumnPick
  } from "$lib/event-log/utils/roles";
  import {
    columnHeaderClass,
    columnCellClass,
    type ColumnPickState
  } from "$lib/event-log/utils/column-highlight";
  import type { FormatInference } from "$lib/event-log/utils/timestamp-format";
  import type { FormatCheck } from "$lib/event-log/types";
  import {
    formatCheckDetail,
    formatCheckMessage,
    patternUnresolved
  } from "$lib/event-log/utils/format-check";
  import TimestampFormatField from "./timestamp-format-field.svelte";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import CircleOff from "@lucide/svelte/icons/circle-off";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let {
    columns,
    rows,
    assignments = $bindable(),
    activeRole = $bindable(),
    hoveredCol = $bindable(),
    visibleColumns = $bindable(),
    roleByColumn,
    formatInference,
    formatChecks,
    checkingColumns,
    columnValues,
    columnTimestampFormat = $bindable(),
    onFormatChosen
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    assignments: Record<AssignableRole, string | null>;
    activeRole: ColumnPick | null;
    hoveredCol: number | null;
    visibleColumns: Set<string>;
    roleByColumn: Record<string, AssignableRole>;
    formatInference: Record<string, FormatInference>;
    formatChecks: Record<string, FormatCheck>;
    checkingColumns: string[];
    columnValues: (name: string) => string[];
    columnTimestampFormat: Record<string, string>;
    onFormatChosen: (column: string, pattern: string) => void;
  } = $props();

  // The two timestamp roles are the only ones whose declared type can carry a
  // format, so they are the only cards that grow one.
  const TIMESTAMP_ROLES: ColumnPick[] = ["complete_timestamp", "start_timestamp"];

  /** What a card shows under its label: the column it holds, or a count. */
  function cardValue(pick: ColumnPick): string {
    if (pick !== "other") return assignments[pick] ?? "—";
    if (visibleColumns.size === 0) return "—";
    return `${visibleColumns.size} column${visibleColumns.size === 1 ? "" : "s"}`;
  }

  function pickState(col: string): ColumnPickState {
    return roleByColumn[col] || visibleColumns.has(col) ? "picked" : "none";
  }

  function setFormat(col: string, value: string) {
    columnTimestampFormat = { ...columnTimestampFormat, [col]: value };
    onFormatChosen(col, value);
  }

  // The armed card is the only thing saying what the next column click fills.
  function armRole(pick: ColumnPick) {
    activeRole = pick;
  }

  function toggleExtra(col: string) {
    const next = new Set(visibleColumns);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    visibleColumns = next;
  }

  // Nothing happens in the table until a card is armed, and filling one leaves
  // it armed: only a card click moves the highlight, so a second column click
  // replaces the mapping the user just made. Clicking a column that already
  // carries a role clears it and arms that role, whatever was armed before.
  function handleColumnClick(col: string) {
    const existing = roleByColumn[col];
    if (existing) {
      assignments = { ...assignments, [existing]: null };
      activeRole = existing;
      return;
    }
    if (!activeRole) return;
    if (activeRole === "other") {
      toggleExtra(col);
      return;
    }
    // A column carries a role or is an extra field, never both.
    if (visibleColumns.has(col)) toggleExtra(col);
    assignments = { ...assignments, [activeRole]: col };
  }

  function setHoveredCol(i: number) {
    hoveredCol = i;
  }

  function clearHoveredCol(i: number) {
    if (hoveredCol === i) hoveredCol = null;
  }
</script>

<!--
  The padding is the room the corner badges overhang into: the step scrolls, and
  a scroll box clips whatever sits outside it.
-->
<div class="mb-4 grid shrink-0 grid-cols-1 gap-3 pt-2 pr-2 pl-2 sm:grid-cols-3 xl:grid-cols-5">
  {#each pickOrder as pick}
    {@const col = pick === "other" ? null : assignments[pick]}
    {@const showFormat = col !== null && TIMESTAMP_ROLES.includes(pick)}
    {@const check = col ? formatChecks[col] : undefined}
    {@const pattern = col ? (columnTimestampFormat[col] ?? "") : ""}
    {@const unresolved =
      showFormat && !checkingColumns.includes(col ?? "") && patternUnresolved(pattern, check)}
    {@const mismatched = showFormat && !unresolved && check && check.failed > 0 ? check : null}
    {@const Icon = pickMeta[pick].icon}
    {@const badge =
      cardValue(pick) === "—"
        ? "bg-muted text-muted-foreground"
        : "bg-primary text-primary-foreground"}
    <div
      class={`border-border bg-card relative flex items-center gap-3 border p-3 pl-6 text-left shadow-sm transition-shadow hover:shadow-md ${
        activeRole === pick ? "bg-accent ring-primary ring-2 ring-inset" : ""
      }`}
    >
      <!--
        The badge sits on the card's own corner rather than in the row, so the
        column name gets the whole width the card can spare.
      -->
      <span
        class={`border-border absolute -top-2 -left-2 flex h-7 w-7 items-center justify-center border ${badge}`}
        aria-hidden="true"
      >
        <Icon class="h-4 w-4" />
      </span>
      <!--
        The card arms a role; the format control next to it is interactive in
        its own right, so only the label is the button.
      -->
      <button
        type="button"
        onclick={() => armRole(pick)}
        aria-pressed={activeRole === pick}
        class="focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer flex-col text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span
          class="text-muted-foreground block w-full truncate text-[0.625rem] font-semibold tracking-widest whitespace-nowrap uppercase"
        >
          {pickMeta[pick].label}
        </span>
        <span class="text-card-foreground block w-full truncate font-mono text-sm">
          {cardValue(pick)}
        </span>
      </button>
      {#if col && (unresolved || mismatched)}
        <!--
          The warning belongs to the card, not to the format control, so it sits
          in the card's own corner. Unresolved reads louder than a mismatch: it
          is the one that holds the wizard.
        -->
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger
              class={`absolute -top-2 -right-2 rounded-full p-1 ${
                unresolved ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"
              }`}
              aria-label={unresolved
                ? `No timestamp pattern reads ${col}`
                : formatCheckMessage(col, mismatched!)}
            >
              <TriangleAlert class="h-4 w-4" />
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-72 space-y-1">
              {#if unresolved}
                <p class="font-medium">No timestamp pattern reads {col}. Set one.</p>
              {:else if mismatched}
                <p class="font-medium">{formatCheckMessage(col, mismatched)}</p>
                {#if formatCheckDetail(mismatched)}
                  <p class="opacity-80">{formatCheckDetail(mismatched)}</p>
                {/if}
              {/if}
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/if}
      {#if showFormat && col}
        <!--
          The column name is short and truncates anyway, so the format sits in
          the space it leaves rather than stacking underneath and making the two
          timestamp cards twice the height of the other two.
        -->
        <div class="shrink-0">
          <TimestampFormatField
            column={col}
            values={columnValues(col)}
            inference={formatInference[col]}
            pattern={columnTimestampFormat[col] ?? ""}
            check={formatChecks[col]}
            checking={checkingColumns.includes(col)}
            onPatternChange={(value) => setFormat(col, value)}
          />
        </div>
      {/if}
    </div>
  {/each}
</div>

<!--
  The box is bounded and scrolls on both axes itself, so its horizontal bar sits
  at the bottom edge of the box and stays reachable from any row.
-->
<div class="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col border">
  <div class="persistent-scrollbars min-h-0 flex-1 overflow-x-scroll overflow-y-auto">
    <!--
        A plain table, not Table.Root: that component wraps itself in its own
        `overflow-x-auto` div, which would scroll at the bottom of the rows
        instead of at the bottom of the box.
      -->
    <table class="w-max min-w-full caption-bottom border-separate border-spacing-0 text-xs">
      <Table.Header class="sticky top-0 z-10">
        <Table.Row class="hover:bg-transparent">
          <Table.Head
            class="border-border bg-card text-muted-foreground sticky left-0 z-20 h-auto border-r border-b px-2 py-1 text-right font-mono text-xs font-normal"
          >
            #
          </Table.Head>
          {#each columns as { name: col }, c}
            {@const role = roleByColumn[col]}
            {@const state = pickState(col)}
            <Table.Head class="border-border h-auto p-0">
              <button
                type="button"
                onclick={() => handleColumnClick(col)}
                onmouseenter={() => setHoveredCol(c)}
                onmouseleave={() => clearHoveredCol(c)}
                class={`border-border flex w-full cursor-pointer items-center gap-2 border-r border-b px-3 py-1 text-left font-mono text-xs whitespace-nowrap transition-colors ${columnHeaderClass(
                  state,
                  hoveredCol === c
                )}`}
              >
                <!--
                  Every header carries an icon in the same leading slot, so the
                  column keeps its width whatever role it is given.
                -->
                {#if role}
                  {@const HeaderIcon = pickMeta[role].icon}
                  <HeaderIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {:else if state === "picked"}
                  {@const ExtraIcon = pickMeta.other.icon}
                  <ExtraIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {:else}
                  <CircleOff class="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                {/if}
                <span>{col}</span>
              </button>
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each rows as row, r}
          <!--
            Every row paints its own background, banded, so the index column can
            take it with `bg-inherit` and still be opaque while it scrolls.
          -->
          <Table.Row class={`hover:bg-transparent ${r % 2 === 1 ? "bg-indigo-50" : "bg-card"}`}>
            <Table.Cell
              class="border-border text-muted-foreground sticky left-0 z-10 border-r border-b bg-inherit px-2 py-0.5 text-right font-mono text-xs"
            >
              {r + 1}
            </Table.Cell>
            {#each row as cell, j}
              {@const colName = columns[j].name}
              <Table.Cell
                onclick={() => handleColumnClick(colName)}
                onmouseenter={() => setHoveredCol(j)}
                onmouseleave={() => clearHoveredCol(j)}
                class={`border-border border-r border-b px-3 py-0.5 font-mono text-xs whitespace-nowrap transition-colors ${columnCellClass(
                  pickState(colName),
                  hoveredCol === j
                )}`}
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
