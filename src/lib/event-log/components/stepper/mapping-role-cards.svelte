<script lang="ts">
  import type { TimestampFormats } from "$lib/event-log/state/timestamp-formats.svelte";
  import {
    pickMeta,
    pickOrder,
    type AssignableRole,
    type ColumnPick
  } from "$lib/event-log/utils/roles";
  import { formatCheckDetail, formatCheckMessage } from "$lib/event-log/utils/format-check";
  import { cn } from "$lib/utils";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import TimestampFormatField from "./timestamp-format-field.svelte";

  let {
    assignments,
    activeRole = $bindable(),
    visibleColumns,
    timestampFormats
  }: {
    assignments: Record<AssignableRole, string | null>;
    activeRole: ColumnPick | null;
    visibleColumns: Set<string>;
    timestampFormats: TimestampFormats;
  } = $props();

  const TIMESTAMP_ROLES: ColumnPick[] = ["complete_timestamp", "start_timestamp"];

  function cardValue(pick: ColumnPick): string {
    if (pick !== "other") return assignments[pick] ?? "Not set";
    if (visibleColumns.size === 0) return "Not set";
    return `${visibleColumns.size} column${visibleColumns.size === 1 ? "" : "s"}`;
  }
</script>

<!-- Padding keeps the corner badges inside the scroll box. -->
<div class="mb-4 grid shrink-0 grid-cols-1 gap-3 pt-2 pr-2 pl-2 sm:grid-cols-3 xl:grid-cols-5">
  {#each pickOrder as pick}
    {@const column = pick === "other" ? null : assignments[pick]}
    {@const showFormat = column !== null && TIMESTAMP_ROLES.includes(pick)}
    {@const check = column ? timestampFormats.checks[column] : undefined}
    {@const pattern = column ? (timestampFormats.patterns[column] ?? "") : ""}
    {@const unresolved =
      showFormat &&
      !timestampFormats.isChecking(column ?? "") &&
      timestampFormats.isUnresolved(column ?? "", pattern)}
    {@const mismatched = showFormat && !unresolved && check && check.failed > 0 ? check : null}
    {@const Icon = pickMeta[pick].icon}
    {@const assigned = cardValue(pick) !== "Not set"}
    <div
      class={cn(
        "border-border bg-card relative flex items-center gap-3 border p-3 pl-6 text-left shadow-sm transition-shadow hover:shadow-md",
        activeRole === pick && "bg-accent ring-primary ring-2 ring-inset"
      )}
    >
      <span
        class={cn(
          "border-border absolute -top-2 -left-2 flex size-7 items-center justify-center border",
          assigned ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
        aria-hidden="true"
      >
        <Icon class="size-4" />
      </span>
      <button
        type="button"
        onclick={() => (activeRole = pick)}
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

      {#if column && (unresolved || mismatched)}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger
              class={cn(
                "absolute -top-2 -right-2 rounded-full p-1",
                unresolved ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}
              aria-label={unresolved
                ? `No timestamp pattern reads ${column}`
                : formatCheckMessage(column, mismatched!)}
            >
              <TriangleAlert />
            </Tooltip.Trigger>
            <Tooltip.Content class="flex max-w-72 flex-col gap-1">
              {#if unresolved}
                <p class="font-medium">No timestamp pattern reads {column}. Set one.</p>
              {:else if mismatched}
                <p class="font-medium">{formatCheckMessage(column, mismatched)}</p>
                {#if formatCheckDetail(mismatched)}
                  <p class="opacity-80">{formatCheckDetail(mismatched)}</p>
                {/if}
              {/if}
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/if}

      {#if showFormat && column}
        <div class="shrink-0">
          <TimestampFormatField {column} formats={timestampFormats} />
        </div>
      {/if}
    </div>
  {/each}
</div>
