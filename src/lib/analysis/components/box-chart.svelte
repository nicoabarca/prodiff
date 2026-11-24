<script lang="ts">
  /**
   * The drawing core of a box plot: one row per Group over `domain`, plus
   * optional dots per Group and an HTML `overlay` placed in plot coordinates.
   * `dots` are drawn past the whiskers as a tail histogram.
   * `hover` picks what the pointer reads: a Group's box figures, or the value
   * under it on the value axis.
   */
  import type { Snippet } from "svelte";
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Highlight, Html, Svg, Tooltip } from "layerchart";
  import { valueTicks } from "$lib/analysis/utils/axis";
  import type { BoxRow } from "$lib/analysis/utils/box-plot";
  import TailHistogram from "$lib/analysis/components/tail-histogram.svelte";
  import ValueHover from "$lib/analysis/components/value-hover.svelte";
  import Fit from "$lib/components/fit/fit.svelte";

  type Padding = { top?: number; right?: number; bottom?: number; left?: number };
  /** `value` maps a value onto the value axis, `band` a Group id to the middle of its band. */
  type Place = { value: (value: number) => number; band: (id: string) => number };

  let {
    rows,
    domain,
    constant,
    format,
    pointerFormat,
    formatCount,
    ladder = [],
    orientation = "vertical",
    contain = "container",
    padding,
    bandLabelOffset = 0,
    bandLabels = true,
    hover = "box",
    dots,
    overlay
  }: {
    rows: BoxRow[];
    domain: [number, number];
    constant: number;
    format: (value: number) => string;
    pointerFormat?: (value: number) => string;
    formatCount: (value: number) => string;
    ladder?: number[];
    orientation?: "vertical" | "horizontal";
    contain?: "container" | "window";
    padding?: Padding;
    bandLabelOffset?: number;
    bandLabels?: boolean;
    hover?: "box" | "value";
    dots?: Record<string, number[]>;
    overlay?: Snippet<[Place]>;
  } = $props();

  const horizontal = $derived(orientation === "horizontal");
  const low = $derived(domain[0]);
  const high = $derived(domain[1]);
  const scale = $derived(scaleSymlog().constant(constant));
  /** A horizontal plot without the band axis labels its low end on the value axis. */
  const ticks = $derived(
    valueTicks(low, high, constant, format, {
      horizontal,
      ladder,
      labelLow: horizontal && !bandLabels
    })
  );
  const band = $derived(scaleBand().padding(0.35));
  const chartPadding = $derived(
    padding ??
      (horizontal
        ? { left: 120, right: 8, bottom: 20 }
        : { left: 52, right: 12, bottom: 24, top: 8 })
  );
  /** The band axis draws ticks only; the Group names sit in an `Html` layer, where `Fit` can cut them. */
  const noLabel = () => "";
  const center = (axis: { (value: string): number; bandwidth?: () => number }, id: string) =>
    axis(id) + (axis.bandwidth?.() ?? 0) / 2;
</script>

<Chart
  data={rows}
  x={horizontal ? "median" : "id"}
  y={horizontal ? "id" : "median"}
  xScale={horizontal ? scale : band}
  yScale={horizontal ? band : scale}
  xDomain={horizontal ? [low, high] : undefined}
  yDomain={horizontal ? undefined : [low, high]}
  valueAxis={horizontal ? "x" : "y"}
  tooltipContext={{ mode: hover === "box" ? "band" : "manual" }}
  padding={chartPadding}
>
  {#snippet children({ context })}
    <Svg>
      {#if horizontal}
        {#if bandLabels}
          <Axis placement="left" rule grid={false} format={noLabel} tickLength={4} />
        {/if}
        <Axis placement="bottom" grid rule {ticks} {format} />
      {:else}
        <Axis placement="left" grid rule {ticks} {format} />
        <Axis placement="bottom" rule format={noLabel} tickLength={bandLabels ? 4 : 0} />
      {/if}
      <ChartClipPath>
        {#each rows as box (box.id)}
          {#if box.whiskerLow === box.whiskerHigh}
            <circle
              cx={horizontal ? context.xScale(box.median) : center(context.xScale, box.id)}
              cy={horizontal ? center(context.yScale, box.id) : context.yScale(box.median)}
              r="4"
              fill={box.color}
              fill-opacity="0.18"
              stroke={box.color}
              stroke-width="1.5"
            />
          {:else}
            <BoxPlot
              data={box}
              min="whiskerLow"
              q1="q1"
              median="median"
              q3="q3"
              max="whiskerHigh"
              fill={box.color}
              fillOpacity={0.18}
              stroke={box.color}
              strokeWidth={1.5}
            />
          {/if}
          {#if dots}
            {@const value = horizontal ? context.xScale : context.yScale}
            {@const band = horizontal ? context.yScale : context.xScale}
            <TailHistogram
              values={dots[box.id] ?? []}
              n={box.n ?? (dots[box.id]?.length || 1)}
              color={box.color}
              {horizontal}
              position={value}
              middle={center(band, box.id)}
              full={band.bandwidth?.() ?? 0}
            />
          {/if}
        {/each}
        {#if hover === "box"}
          <Highlight area />
        {/if}
      </ChartClipPath>
    </Svg>

    {#if bandLabels}
      <!-- The tooltip hit areas are a full-size SVG drawn above `children`; `zIndex` lifts the names over it. -->
      <Html pointerEvents={false} zIndex={1}>
        {#each rows as box (box.id)}
          {#if horizontal}
            <div
              class="pointer-events-auto absolute flex w-28 -translate-y-1/2 justify-end text-[0.625rem] font-light"
              style:top="{center(context.yScale, box.id)}px"
              style:right="calc(100% + {8 + bandLabelOffset}px)"
            >
              <Fit text={box.name} class="block" />
            </div>
          {:else}
            <div
              class="pointer-events-auto absolute flex -translate-x-1/2 justify-center text-[0.625rem] font-light"
              style:left="{center(context.xScale, box.id)}px"
              style:top="calc(100% + {4 + bandLabelOffset}px)"
              style:width="{context.xScale.bandwidth?.() ?? 0}px"
            >
              <Fit text={box.name} class="block" />
            </div>
          {/if}
        {/each}
      </Html>
    {/if}

    {#if overlay}
      <Html pointerEvents={false}>
        {@render overlay({
          value: (value) => (horizontal ? context.xScale(value) : context.yScale(value)),
          band: (id) => (horizontal ? center(context.yScale, id) : center(context.xScale, id))
        })}
      </Html>
    {/if}

    {#if hover === "value"}
      {@const value = horizontal ? context.xScale : context.yScale}
      <ValueHover
        {horizontal}
        invert={(pixel) => value.invert?.(pixel) ?? Number.NaN}
        format={pointerFormat ?? format}
      />
    {:else}
      <Tooltip.Root contained={contain} props={{ root: { class: "w-max" } }}>
        {#snippet children({ data: box })}
          <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
            <p class="mb-1 text-[0.6875rem] font-semibold">{box.name}</p>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[0.625rem]">
              {#each [["Max", format(box.max)], ["Q3", format(box.q3)], ["Median", format(box.median)], ["Q1", format(box.q1)], ["Min", format(box.min)], ["IQR", format(box.q3 - box.q1)], ["n", box.n === undefined ? null : formatCount(box.n)]] as [label, value] (label)}
                {#if value !== null}
                  <dt class="text-muted-foreground">{label}</dt>
                  <dd class="text-right whitespace-nowrap">{value}</dd>
                {/if}
              {/each}
            </dl>
          </div>
        {/snippet}
      </Tooltip.Root>
    {/if}
  {/snippet}
</Chart>
