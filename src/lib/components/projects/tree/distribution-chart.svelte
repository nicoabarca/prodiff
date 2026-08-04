<script lang="ts">
  /**
   * One attribute's Distribution at the selected node — horizontal bars, one
   * band per value or bin, one bar per Group within it.
   *
   * Horizontal rather than vertical columns: the categories here are resource
   * codes and activity names, which are long. Rotated tick labels under a
   * column chart are unreadable at this size, and the two chart components that
   * came before this one (`summary-compare`, `comparison-charts`) both settled
   * on horizontal for the same reason.
   *
   * The plot's height is computed from the row count rather than taken from the
   * flex parent. `Chart.Container` is `aspect-video` by default, so a chart left
   * to fill a flex box has no resolvable height and renders its axes with no
   * bars between them.
   *
   * The Scope badge is repeated here rather than left to the drawer header on
   * purpose: a card read on its own, or screenshotted out of the drawer, has to
   * still say which events it counted.
   */
  import { BarChart, Tooltip } from "layerchart";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import {
    bars,
    SCOPE_LABEL,
    TOP_CATEGORIES,
    type Distribution,
    type Scope
  } from "$lib/distributions";
  import { formatDuration, formatNumber } from "$lib/format";
  import { isDurationAttribute } from "$lib/tree";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import X from "@lucide/svelte/icons/x";

  let {
    attribute,
    distribution,
    scope,
    compare,
    nameA,
    nameB,
    expanded,
    onToggleExpanded,
    onRemove
  }: {
    attribute: string;
    distribution: Distribution;
    scope: Scope;
    compare: boolean;
    nameA: string;
    nameB: string;
    expanded: boolean;
    onToggleExpanded: () => void;
    onRemove: () => void;
  } = $props();

  // The Groups keep the colours they carry in the tree and the differences
  // panel, so a resource that is "the blue one" stays blue across all three.
  const COLOR_A = "var(--slice-1)";
  const COLOR_B = "var(--slice-2)";

  const data = $derived(bars(distribution, attribute, expanded));

  const series = $derived(
    compare
      ? [
          { key: "a", label: nameA, color: COLOR_A },
          { key: "b", label: nameB, color: COLOR_B }
        ]
      : [{ key: "a", label: nameA, color: COLOR_A }]
  );

  const config = $derived.by((): Chart.ChartConfig => {
    const entries: Chart.ChartConfig = { a: { label: nameA, color: COLOR_A } };
    if (compare) entries.b = { label: nameB, color: COLOR_B };
    return entries;
  });

  /**
   * A numeric attribute whose values are all identical. The backend ships it as
   * a single bin, which would draw as one full-width bar saying nothing — the
   * value itself is the finding, so it is stated in words instead.
   */
  const constant = $derived(
    distribution.type === "numerical" && distribution.countsA.length === 1
      ? distribution.edges[0]
      : null
  );

  const format = $derived(
    isDurationAttribute(attribute)
      ? formatDuration
      : (value: number) => formatNumber(Math.round(value))
  );

  /** Totals the tooltip reads shares against. */
  const totals = $derived.by(() => {
    if (distribution.type === "categorical") {
      return { a: distribution.totalA, b: distribution.totalB };
    }
    if (distribution.type === "numerical") return { a: distribution.nA, b: distribution.nB };
    return { a: 0, b: 0 };
  });

  const hiddenCategories = $derived(
    distribution.type === "categorical"
      ? Math.max(0, distribution.distinct - TOP_CATEGORIES)
      : 0
  );

  const truncate = (label: string) => (label.length > 14 ? `${label.slice(0, 13)}…` : label);

  const share = (value: number, total: number) =>
    total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
</script>

<div class="bg-card border-border flex w-[26rem] shrink-0 flex-col border">
  <div class="border-border flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
    <div class="flex min-w-0 flex-col gap-1">
      <h3 class="truncate text-xs font-semibold" title={attribute}>{attribute}</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" class="text-[0.625rem]">{SCOPE_LABEL[scope]}</Badge>
        {#if distribution.type === "categorical"}
          <span class="text-muted-foreground text-[0.625rem]">
            {formatNumber(Math.min(expanded ? distribution.values.length : TOP_CATEGORIES, distribution.distinct))}
            of {formatNumber(distribution.distinct)} values
          </span>
        {:else if distribution.type === "numerical" && constant === null}
          <span class="text-muted-foreground text-[0.625rem]">
            {distribution.countsA.length} bins · n {formatNumber(totals.a + totals.b)}
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

  {#if compare}
    <div
      class="text-muted-foreground border-border flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[0.625rem]"
    >
      {#each [[nameA, COLOR_A], [nameB, COLOR_B]] as [name, color] (name)}
        <span class="inline-flex min-w-0 items-center gap-1.5">
          <span class="size-2 shrink-0" style="background:{color}" aria-hidden="true"></span>
          <span class="truncate">{name}</span>
        </span>
      {/each}
    </div>
  {/if}

  {#if distribution.type === "empty"}
    <p class="text-muted-foreground flex flex-1 items-center justify-center p-3 text-center text-xs">
      Not recorded on any event counted here.
    </p>
  {:else if constant !== null}
    <div class="flex flex-1 flex-col justify-center gap-1 p-3">
      <p class="text-xs">
        Every value is <span class="font-semibold">{format(constant)}</span>.
      </p>
      <p class="text-muted-foreground text-[0.625rem]">
        {nameA} {formatNumber(totals.a)}{#if compare} · {nameB} {formatNumber(totals.b)}{/if} values —
        no spread to plot.
      </p>
    </div>
  {:else if data.length === 0}
    <p class="text-muted-foreground flex flex-1 items-center justify-center p-3 text-center text-xs">
      Nothing to plot here.
    </p>
  {:else}
    <!-- The plot is as tall as its rows need; the card scrolls when that is
         more than the drawer's current height allows. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <Chart.Container
        {config}
        class="aspect-auto h-[calc(1.5rem*var(--rows)+1.75rem)] w-full"
        style="--rows:{data.length}"
      >
        <BarChart
          {data}
          {series}
          seriesLayout="group"
          orientation="horizontal"
          y="label"
          rule={false}
          legend={false}
          bandPadding={0.25}
          groupPadding={0}
          padding={{ left: 92, right: 16, bottom: 20 }}
          props={{
            bars: { stroke: "none", radius: 2, rounded: "all" },
            highlight: { area: { fill: "none" } },
            // The label gutter is fixed, so a long resource code is cut rather
            // than allowed to run off the card. The tooltip carries the full one.
            yAxis: { format: truncate, tickLabelProps: { svgProps: { x: -8 } } },
            xAxis: { ticks: 4, format: (value: number) => formatNumber(value) }
          }}
        >
          <!-- The `tooltip` snippet, not `children`: children would replace the
               chart's own layout wholesale rather than add to it. -->
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
                    <dt class="text-muted-foreground truncate">{nameA}</dt>
                    <dd class="text-right">
                      {formatNumber(row.a)} · {share(row.a, totals.a)}
                    </dd>
                    {#if compare}
                      <dt class="text-muted-foreground truncate">{nameB}</dt>
                      <dd class="text-right">
                        {formatNumber(row.b)} · {share(row.b, totals.b)}
                      </dd>
                    {/if}
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
