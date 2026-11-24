<script lang="ts">
  /**
   * The adjusted box plot (Hubert and Vandervieren, 2008): one row per Group
   * over `domain`, with whiskers from `boxes`, which the medcouple widens on
   * the skewed side. The values past them are drawn as a tail histogram, and
   * the pointer reads the value under it.
   */
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Svg } from "layerchart";
  import { valueTicks } from "$lib/analysis/utils/axis";
  import type { BoxRow } from "$lib/analysis/utils/box-plot";
  import type { AdjustedBox } from "$lib/analysis/types";
  import TailHistogram from "$lib/analysis/components/tail-histogram.svelte";
  import ValueHover from "$lib/analysis/components/value-hover.svelte";

  type Padding = { top?: number; right?: number; bottom?: number; left?: number };

  let {
    rows,
    boxes,
    domain,
    constant,
    format,
    pointerFormat,
    orientation = "vertical",
    padding
  }: {
    rows: BoxRow[];
    boxes: Record<string, AdjustedBox>;
    domain: [number, number];
    constant: number;
    format: (value: number) => string;
    pointerFormat?: (value: number) => string;
    orientation?: "vertical" | "horizontal";
    padding: Padding;
  } = $props();

  const horizontal = $derived(orientation === "horizontal");
  const low = $derived(domain[0]);
  const high = $derived(domain[1]);
  const scale = $derived(scaleSymlog().constant(constant));
  const band = $derived(scaleBand().padding(0.35));
  const ticks = $derived(
    valueTicks(low, high, constant, format, { horizontal, labelLow: horizontal })
  );
  /** Each row with its whiskers moved to the adjusted ones. */
  const adjusted = $derived(
    rows.map((row) => {
      const box = boxes[row.id];
      return box ? { ...row, whiskerLow: box.whiskerLow, whiskerHigh: box.whiskerHigh } : row;
    })
  );
  const center = (axis: { (value: string): number; bandwidth?: () => number }, id: string) =>
    axis(id) + (axis.bandwidth?.() ?? 0) / 2;
</script>

<Chart
  data={adjusted}
  x={horizontal ? "median" : "id"}
  y={horizontal ? "id" : "median"}
  xScale={horizontal ? scale : band}
  yScale={horizontal ? band : scale}
  xDomain={horizontal ? [low, high] : undefined}
  yDomain={horizontal ? undefined : [low, high]}
  valueAxis={horizontal ? "x" : "y"}
  tooltipContext={{ mode: "manual" }}
  {padding}
>
  {#snippet children({ context })}
    {@const value = horizontal ? context.xScale : context.yScale}
    {@const across = horizontal ? context.yScale : context.xScale}
    <Svg>
      <Axis placement={horizontal ? "bottom" : "left"} grid rule {ticks} {format} />
      <ChartClipPath>
        {#each adjusted as row (row.id)}
          <BoxPlot
            data={row}
            min="whiskerLow"
            q1="q1"
            median="median"
            q3="q3"
            max="whiskerHigh"
            fill={row.color}
            fillOpacity={0.18}
            stroke={row.color}
            strokeWidth={1.5}
          />
          {@const tail = boxes[row.id]}
          {#if tail}
            {@const values = [...tail.low, ...tail.high]}
            <TailHistogram
              {values}
              n={row.n ?? (values.length || 1)}
              color={row.color}
              {horizontal}
              position={value}
              middle={center(across, row.id)}
              full={across.bandwidth?.() ?? 0}
            />
          {/if}
        {/each}
      </ChartClipPath>
    </Svg>
    <ValueHover
      {horizontal}
      invert={(pixel) => value.invert?.(pixel) ?? Number.NaN}
      format={pointerFormat ?? format}
    />
  {/snippet}
</Chart>
