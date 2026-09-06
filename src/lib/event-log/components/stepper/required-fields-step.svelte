<script lang="ts">
  import type { ColumnType } from "$lib/event-log/invokers/types";
  import { roleOrder, roleMeta, type AssignableRole } from "$lib/event-log/utils/roles";
  import { columnHeaderClass, columnCellClass } from "$lib/event-log/utils/column-highlight";
  import type { FormatInference } from "$lib/event-log/utils/timestamp-format";
  import type { FormatCheck } from "$lib/event-log/types";
  import { formatCheckDetail, formatCheckMessage } from "$lib/event-log/utils/format-check";
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
    roleByColumn,
    formatInference,
    formatChecks,
    columnValues,
    columnTimestampFormat = $bindable(),
    formatWarningAcknowledged = $bindable()
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    assignments: Record<AssignableRole, string | null>;
    activeRole: AssignableRole | null;
    hoveredCol: number | null;
    roleByColumn: Record<string, AssignableRole>;
    formatInference: Record<string, FormatInference>;
    formatChecks: Record<string, FormatCheck>;
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

  // The armed card is the only thing saying which role the next column click
  // fills.
  function armRole(role: AssignableRole) {
    activeRole = role;
  }

  // Nothing happens in the table until a role is armed, and filling one leaves
  // it armed: only a card click moves the highlight, so a second column click
  // replaces the mapping the user just made. Clicking a column that already
  // carries a role clears it and arms that role.
  function handleColumnClick(col: string) {
    const existing = roleByColumn[col];
    if (existing) {
      assignments = { ...assignments, [existing]: null };
      activeRole = existing;
      return;
    }
    if (!activeRole) return;
    assignments = { ...assignments, [activeRole]: col };
  }

  function setHoveredCol(i: number) {
    hoveredCol = i;
  }

  function clearHoveredCol(i: number) {
    if (hoveredCol === i) hoveredCol = null;
  }
</script>

<div class="mb-4 grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-4">
  {#each roleOrder as role}
    {@const col = assignments[role]}
    {@const showFormat = col !== null && TIMESTAMP_ROLES.includes(role)}
    {@const check = col ? formatChecks[col] : undefined}
    {@const mismatched = showFormat && check && check.failed > 0 ? check : null}
    {@const Icon = roleMeta[role].icon}
    <div
      class={`border-border bg-card flex items-center gap-3 border p-3 text-left shadow-sm transition-shadow hover:shadow-md ${
        activeRole === role ? "bg-accent ring-primary ring-2 ring-inset" : ""
      }`}
    >
      <!--
        The card arms a role; the format control next to it is interactive in
        its own right, so only the icon and the label are the button.
      -->
      <button
        type="button"
        onclick={() => armRole(role)}
        aria-pressed={activeRole === role}
        class="focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span
          class={`flex h-7 w-7 shrink-0 items-center justify-center ${
            col
              ? "bg-primary text-primary-foreground border-transparent"
              : "border-border text-muted-foreground border"
          }`}
        >
          <Icon class="h-4 w-4" aria-hidden="true" />
        </span>
        <span class="min-w-0">
          <span
            class="text-muted-foreground block text-[0.625rem] font-semibold tracking-widest uppercase"
          >
            {roleMeta[role].label}{roleMeta[role].optional ? " (optional)" : ""}
          </span>
          <span class="text-card-foreground block truncate font-mono text-sm">{col ?? "—"}</span>
        </span>
      </button>
      {#if mismatched && col}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger
              class="shrink-0 text-yellow-500"
              aria-label={formatCheckMessage(col, mismatched)}
            >
              <TriangleAlert class="h-4 w-4" />
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-72 space-y-1">
              <p class="font-medium">{formatCheckMessage(col, mismatched)}</p>
              {#if formatCheckDetail(mismatched)}
                <p class="opacity-80">{formatCheckDetail(mismatched)}</p>
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
        <div class="min-w-0 flex-1">
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
  <div class="border-border flex shrink-0 items-center justify-end border-b px-4 py-2">
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
                <!--
                  Every header carries an icon in the same leading slot, so the
                  column keeps its width whatever role it is given.
                -->
                {#if role}
                  {@const HeaderIcon = roleMeta[role].icon}
                  <HeaderIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
