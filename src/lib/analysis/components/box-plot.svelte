<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import BoxChart from "$lib/analysis/components/box-chart.svelte";
  import type { BoxStats } from "$lib/analysis/types";
  import {
    boxRows,
    outlierLabels,
    symlogConstant,
    whiskerDomain,
    type OutlierLabel
  } from "$lib/analysis/utils/box-plot";

  let {
    boxes,
    groups,
    format,
    formatCount,
    orientation = "vertical",
    ladder = [],
    constant,
    contain = "container"
  }: {
    boxes: Record<string, BoxStats | null>;
    groups: { id: string; name: string; color: string }[];
    format: (value: number) => string;
    formatCount: (value: number) => string;
    orientation?: "vertical" | "horizontal";
    ladder?: number[];
    constant?: number;
    contain?: "container" | "window";
  } = $props();

  /** Pixels a horizontal low label takes left of the plot, ahead of the Group names. */
  const LOW_LABEL_ROOM = 64;

  const rows = $derived(boxRows(groups, boxes));
  const horizontal = $derived(orientation === "horizontal");
  const domain = $derived(whiskerDomain(rows));
  const flat = $derived(rows.length === 0 || !(domain[1] > domain[0]));
  const linearBelow = $derived(symlogConstant(rows, domain[0], domain[1], constant));
  const labels = $derived(rows.map((row) => ({ row, ...outlierLabels(row, format, formatCount) })));
  const anyHigh = $derived(labels.some((entry) => entry.high !== null));
  const anyLow = $derived(labels.some((entry) => entry.low !== null));
  const padding = $derived(
    horizontal
      ? { left: 76 + (anyLow ? LOW_LABEL_ROOM : 0), right: anyHigh ? 72 : 8, bottom: 20 }
      : { left: 52, right: 12, bottom: anyLow ? 36 : 24, top: anyHigh ? 20 : 8 }
  );
  const bandLabelOffset = $derived(anyLow ? (horizontal ? LOW_LABEL_ROOM : 12) : 0);
</script>

{#snippet label(text: OutlierLabel, color: string, x: number, y: number, placement: string)}
  <Tooltip.Root>
    <Tooltip.Trigger
      class="pointer-events-auto absolute text-[0.625rem] leading-none whitespace-nowrap {placement}"
      style="left:{x}px;top:{y}px;color:{color}"
    >
      {text.text}
    </Tooltip.Trigger>
    <Tooltip.Content class="text-[0.6875rem]">{text.tooltip}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

{#if flat}
  <p class="flex flex-1 items-center justify-center p-3 text-center text-xs">
    All values are <span class="ml-1 font-semibold">{format(rows[0]?.median ?? 0)}</span>.
  </p>
{:else}
  <div class={horizontal ? "w-full min-w-0" : ""}>
    <div
      class={horizontal
        ? "relative h-[calc(1.75rem*var(--rows)+1.25rem)] w-full"
        : "relative h-64 w-full px-3 py-2"}
      style="--rows:{rows.length}"
    >
      <BoxChart
        {rows}
        {domain}
        constant={linearBelow}
        {format}
        {formatCount}
        {ladder}
        {orientation}
        {contain}
        {padding}
        {bandLabelOffset}
      >
        {#snippet overlay(place)}
          {#each labels as { row, high, low } (row.id)}
            {#if high}
              {#if horizontal}
                {@render label(
                  high,
                  row.color,
                  place.value(row.whiskerHigh),
                  place.band(row.id),
                  "-translate-y-1/2 pl-1"
                )}
              {:else}
                {@render label(
                  high,
                  row.color,
                  place.band(row.id),
                  place.value(row.whiskerHigh),
                  "-translate-x-1/2 -translate-y-full pb-1"
                )}
              {/if}
            {/if}
            {#if low}
              {#if horizontal}
                {@render label(
                  low,
                  row.color,
                  place.value(row.whiskerLow),
                  place.band(row.id),
                  "-translate-x-full -translate-y-1/2 pr-1"
                )}
              {:else}
                {@render label(
                  low,
                  row.color,
                  place.band(row.id),
                  place.value(row.whiskerLow),
                  "-translate-x-1/2 pt-1"
                )}
              {/if}
            {/if}
          {/each}
        {/snippet}
      </BoxChart>
    </div>
  </div>
{/if}
