<script lang="ts">
  /**
   * One attribute's Distribution at the selected node: vertical columns, one band
   * per value or bin, one bar per Group within it.
   *
   * The height is pinned explicitly. `Chart.Container` is `aspect-video` by
   * default, and a chart left to fill a flex box has no resolvable height and
   * draws axes with no bars between them.
   */
  import { BarChart, Tooltip } from "layerchart";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import DurationPlot from "$lib/tree/components/duration-plot.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import type { Distribution } from "$lib/distributions/invokers/types";
  import {
    ENCODINGS,
    ENCODING_HINT,
    ENCODING_LABEL,
    type Encoding,
    PLOT_TOGGLE,
    SCOPE_LABEL,
    type Scope,
    TOP_CATEGORIES
  } from "$lib/distributions/types";
  import { bars, logBars } from "$lib/distributions/utils/distributions";
  import { colorVar, formatDuration, formatNumber } from "$lib/format";
  import type { Test } from "$lib/analysis/types";
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import X from "@lucide/svelte/icons/x";

  let {
    attribute,
    distribution,
    scope,
    test,
    compare,
    groups,
    expanded,
    encoding,
    onEncoding,
    onToggleExpanded,
    onRemove
  }: {
    attribute: string;
    distribution: Distribution;
    scope: Scope;
    test: Test | null;
    compare: boolean;
    groups: { id: string; name: string; color: string }[];
    expanded: boolean;
    encoding: Encoding;
    onEncoding: (next: Encoding) => void;
    onToggleExpanded: () => void;
    onRemove: () => void;
  } = $props();

  /** The Groups drawn, in order. Without comparison only the first is drawn. */
  const drawn = $derived(compare ? groups : groups.slice(0, 1));
  const ids = $derived(drawn.map((group) => group.id));

  /**
   * The duration-only encodings, when the backend computed them. Absent on
   * every other attribute, and absent on a duration whose values were all null.
   */
  const shape = $derived(distribution.type === "numerical" ? distribution.shape : null);

  /** Bars unless a duration asked for something else, where they are the log ladder. */
  const data = $derived(
    shape && encoding === "logBins"
      ? logBars(shape, ids)
      : bars(distribution, attribute, expanded, ids)
  );

  /**
   * Each Group's count lifted onto the row under its own id. Grouped bars place
   * themselves by the series key read off the row, so a count reachable only
   * through an accessor puts every Group in one band.
   */
  const rows = $derived(
    data.map((bar) => ({
      ...bar,
      ...Object.fromEntries(ids.map((id) => [id, bar.counts[id] ?? 0]))
    }))
  );

  const series = $derived(
    drawn.map((group) => ({
      key: group.id,
      label: group.name,
      color: colorVar(group.color)
    }))
  );

  const config = $derived.by((): Chart.ChartConfig => {
    const entries: Chart.ChartConfig = {};
    for (const group of drawn) {
      entries[group.id] = { label: group.name, color: colorVar(group.color) };
    }
    return entries;
  });

  /** A numeric attribute whose values are all identical. Stated in words, not drawn. */
  const constant = $derived(
    distribution.type === "numerical" && (distribution.counts[ids[0]]?.length ?? 0) === 1
      ? distribution.edges[0]
      : null
  );

  const format = $derived(
    isDurationAttribute(attribute)
      ? formatDuration
      : (value: number) => formatNumber(Math.round(value))
  );

  /** Totals the tooltip reads shares against, keyed by Group id. */
  const totals = $derived.by((): Record<string, number> => {
    const source =
      distribution.type === "categorical"
        ? distribution.totals
        : distribution.type === "numerical"
          ? distribution.n
          : {};
    return Object.fromEntries(ids.map((id) => [id, source[id] ?? 0]));
  });

  const totalN = $derived(ids.reduce((sum, id) => sum + totals[id], 0));

  const hiddenCategories = $derived(
    distribution.type === "categorical" ? Math.max(0, distribution.distinct - TOP_CATEGORIES) : 0
  );

  const truncate = (label: string) => (label.length > 14 ? `${label.slice(0, 13)}…` : label);

  const share = (value: number, total: number) =>
    total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
</script>

<div class="bg-card border-border flex min-w-0 flex-col border">
  <div class="border-border flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
    <div class="flex min-w-0 flex-col gap-1">
      <h3 class="truncate text-xs font-semibold" title={attribute}>{attribute}</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <EffectChip {test} />
        <Badge variant="secondary" class="text-[0.625rem]">{SCOPE_LABEL[scope]}</Badge>
        {#if distribution.type === "categorical"}
          <span class="text-muted-foreground text-[0.625rem]">
            {formatNumber(
              Math.min(
                expanded ? distribution.values.length : TOP_CATEGORIES,
                distribution.distinct
              )
            )}
            of {formatNumber(distribution.distinct)} values
          </span>
        {:else if distribution.type === "numerical" && constant === null}
          <span class="text-muted-foreground text-[0.625rem]">
            {#if shape && encoding !== "logBins"}
              n {formatNumber(totalN)}
            {:else}
              {data.length} bins · n {formatNumber(totalN)}
            {/if}
          </span>
        {/if}
      </div>
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="shrink-0"
      aria-label="Remove {attribute}"
      onclick={onRemove}
    >
      <X />
    </Button>
  </div>

  {#if shape && constant === null}
    <div class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={encoding}
        onValueChange={(next) => next && onEncoding(next as Encoding)}
      >
        {#each ENCODINGS as option (option)}
          <ToggleGroup.Item
            value={option}
            title={ENCODING_HINT[option]}
            aria-label={ENCODING_HINT[option]}
            class="text-[0.625rem] {PLOT_TOGGLE}"
          >
            {ENCODING_LABEL[option]}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>
  {/if}

  {#if compare}
    <div
      class="text-muted-foreground border-border flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[0.625rem]"
    >
      {#each drawn as group (group.id)}
        <span class="inline-flex min-w-0 items-center gap-1.5">
          <span
            class="size-2 shrink-0"
            style="background:{colorVar(group.color)}"
            aria-hidden="true"
          ></span>
          <span class="truncate">{group.name}</span>
        </span>
      {/each}
    </div>
  {/if}

  {#if distribution.type === "empty"}
    <p
      class="text-muted-foreground flex flex-1 items-center justify-center p-3 text-center text-xs"
    >
      Not recorded on any event counted here.
    </p>
  {:else if constant !== null}
    <div class="flex flex-1 flex-col justify-center gap-1 p-3">
      <p class="text-xs">
        Every value is <span class="font-semibold">{format(constant)}</span>.
      </p>
      <p class="text-muted-foreground text-[0.625rem]">
        {drawn.map((group) => `${group.name} ${formatNumber(totals[group.id])}`).join(" · ")} values,
        so there is no spread to plot.
      </p>
    </div>
  {:else if shape && encoding !== "logBins"}
    <DurationPlot {shape} {encoding} {compare} {groups} />
  {:else if data.length === 0}
    <p
      class="text-muted-foreground flex flex-1 items-center justify-center p-3 text-center text-xs"
    >
      Nothing to plot here.
    </p>
  {:else}
    <div class="overflow-x-auto px-3 py-2">
      <Chart.Container
        {config}
        class="aspect-auto h-64 w-[max(100%,calc(2.25rem*var(--cols)))]"
        style="--cols:{data.length}"
      >
        <BarChart
          data={rows}
          {series}
          seriesLayout="group"
          orientation="vertical"
          x="label"
          rule={false}
          legend={false}
          bandPadding={0.25}
          groupPadding={0}
          padding={{ left: 44, right: 16, bottom: 72 }}
          props={{
            bars: { stroke: "none", radius: 2, rounded: "all" },
            highlight: { area: { fill: "none" } },
            // The label gutter is fixed, so a long resource code is cut. The tooltip
            // carries the full one.
            xAxis: {
              format: truncate,
              tickLabelProps: { rotate: -45, textAnchor: "end", svgProps: { y: 4 } }
            },
            yAxis: { ticks: 4, format: (value: number) => formatNumber(value) }
          }}
        >
          <!-- The `tooltip` snippet, not `children`: children replace the chart's own layout. -->
          {#snippet tooltip()}
            <Tooltip.Root props={{ root: { class: "w-max" } }}>
              {#snippet children({ data: row })}
                <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
                  <p class="mb-1 max-w-64 text-[0.6875rem] font-semibold break-words">
                    {row.label}
                    {#if row.collapsed}
                      <span class="text-muted-foreground font-normal">
                        · {formatNumber(row.collapsed)} values
                      </span>
                    {/if}
                  </p>
                  <dl class="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[0.625rem]">
                    {#each drawn as group (group.id)}
                      {@const count = row.counts[group.id] ?? 0}
                      <dt class="text-muted-foreground truncate">{group.name}</dt>
                      <dd class="text-right">
                        {formatNumber(count)} · {share(count, totals[group.id])}
                      </dd>
                    {/each}
                  </dl>
                </div>
              {/snippet}
            </Tooltip.Root>
          {/snippet}
        </BarChart>
      </Chart.Container>

      {#if hiddenCategories > 0}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pt-1 text-[0.625rem]"
          onclick={onToggleExpanded}
        >
          {#if expanded}
            <ChevronUp class="size-3" aria-hidden="true" />
            Show top {TOP_CATEGORIES}
          {:else}
            <ChevronDown class="size-3" aria-hidden="true" />
            {formatNumber(hiddenCategories)} more values
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>
