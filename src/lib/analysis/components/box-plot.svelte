<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import BoxChart from "$lib/analysis/components/box-chart.svelte";
  import BoxPlotDialog from "$lib/analysis/components/box-plot-dialog.svelte";
  import type { BoxAlternatives, BoxStats, OutlierLoad } from "$lib/analysis/types";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import {
    boxRows,
    outlierLabels,
    symlogConstant,
    whiskerDomain,
    type OutlierLabel
  } from "$lib/analysis/utils/box-plot";

  type Expansion =
    | { load?: undefined; alternatives?: undefined; title?: undefined }
    | { load: OutlierLoad; alternatives?: BoxAlternatives; title: string };

  let {
    boxes,
    groups,
    format,
    pointerFormat,
    formatCount,
    orientation = "vertical",
    ladder = [],
    constant,
    contain = "container",
    legend = false,
    load,
    alternatives,
    title
  }: {
    boxes: Record<string, BoxStats | null>;
    groups: { id: string; name: string; color: string }[];
    format: (value: number) => string;
    pointerFormat?: (value: number) => string;
    formatCount: (value: number) => string;
    orientation?: "vertical" | "horizontal";
    ladder?: number[];
    constant?: number;
    contain?: "container" | "window";
    legend?: boolean;
  } & Expansion = $props();

  let expanded = $state(false);

  /** Pixels one character of a 0.625rem label takes, plus the gap either side of the label. */
  const CHAR_WIDTH = 6;
  const LABEL_GAP = 8;

  const rows = $derived(boxRows(groups, boxes));
  const horizontal = $derived(orientation === "horizontal");
  const domain = $derived(whiskerDomain(rows));
  const flat = $derived(rows.length === 0 || !(domain[1] > domain[0]));
  const linearBelow = $derived(symlogConstant(rows, domain[0], domain[1], constant));
  const labels = $derived(rows.map((row) => ({ row, ...outlierLabels(row, format, formatCount) })));
  const anyHigh = $derived(labels.some((entry) => entry.high !== null));
  const anyLow = $derived(labels.some((entry) => entry.low !== null));
  /** Pixels the widest label on one side takes, so a horizontal plot can leave that room beside it. */
  const room = (side: (OutlierLabel | null)[]) =>
    Math.max(0, ...side.map((text) => (text?.text.length ?? 0) * CHAR_WIDTH)) + LABEL_GAP;
  const lowRoom = $derived(anyLow ? room(labels.map((entry) => entry.low)) : 0);
  const highRoom = $derived(anyHigh ? room(labels.map((entry) => entry.high)) : 0);
  const padding = $derived(
    horizontal
      ? { left: (legend ? 24 : 120) + lowRoom, right: Math.max(8, highRoom), bottom: 20 }
      : { left: 52, right: 12, bottom: anyLow ? 36 : 24, top: anyHigh ? 20 : 8 }
  );
  const expandable = $derived(load !== undefined && (anyHigh || anyLow));
  const bandLabelOffset = $derived(anyLow ? (horizontal ? lowRoom : 12) : 0);
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
        bandLabels={!legend}
      >
        {#snippet overlay(place)}
          {#each labels as { row, high, low } (row.id)}
            {#if high}
              {#if horizontal}
                {@render label(
                  high,
                  row.color,
                  place.value(domain[1]),
                  place.band(row.id),
                  "-translate-y-1/2 pl-1.5"
                )}
              {:else}
                {@render label(
                  high,
                  row.color,
                  place.band(row.id),
                  place.value(domain[1]),
                  "-translate-x-1/2 -translate-y-full pb-1"
                )}
              {/if}
            {/if}
            {#if low}
              {#if horizontal}
                {@render label(
                  low,
                  row.color,
                  place.value(domain[0]),
                  place.band(row.id),
                  "-translate-x-full -translate-y-1/2 pr-1.5"
                )}
              {:else}
                {@render label(
                  low,
                  row.color,
                  place.band(row.id),
                  place.value(domain[0]),
                  "-translate-x-1/2 pt-1"
                )}
              {/if}
            {/if}
          {/each}
        {/snippet}
      </BoxChart>
    </div>
    {#if legend}
      <div class="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 text-[0.625rem]">
        {#each rows as row (row.id)}
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <span
              class="size-2 shrink-0 rounded-full"
              style:background={row.color}
              aria-hidden="true"
            ></span>
            <span class="min-w-0 [overflow-wrap:break-word]">{row.name}</span>
          </span>
        {/each}
      </div>
    {/if}
    {#if expandable && load && title}
      <div class="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onclick={(event) => {
            event.stopPropagation();
            expanded = true;
          }}
        >
          <Maximize2 data-icon="inline-start" />
          Outliers
        </Button>
      </div>
      <BoxPlotDialog
        bind:open={expanded}
        {title}
        {rows}
        {load}
        {alternatives}
        {format}
        {pointerFormat}
        {formatCount}
        {orientation}
      />
    {/if}
  </div>
{/if}
