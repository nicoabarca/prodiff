<script lang="ts">
  /**
   * The letter-value plot (Hofmann, Wickham and Kafadar, 2017): one row per
   * Group over `domain`. The fourths are one box across the band; each deeper
   * letter value adds a strip on either side of the box inside it, as thick
   * as its share of the cases and paler the further out it lies. The values
   * past the last box are dots, and the pointer reads the value under it.
   */
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, Chart, ChartClipPath, Svg } from "layerchart";
  import { valueTicks } from "$lib/analysis/utils/axis";
  import { dotOffsets, letterSegments } from "$lib/analysis/utils/letter-values";
  import type { BoxRow } from "$lib/analysis/utils/box-plot";
  import type { LetterValues } from "$lib/analysis/types";
  import ValueHover from "$lib/analysis/components/value-hover.svelte";

  type Padding = { top?: number; right?: number; bottom?: number; left?: number };

  let {
    rows,
    plots,
    domain,
    constant,
    format,
    pointerFormat,
    orientation = "vertical",
    padding
  }: {
    rows: BoxRow[];
    plots: Record<string, LetterValues>;
    domain: [number, number];
    constant: number;
    format: (value: number) => string;
    pointerFormat?: (value: number) => string;
    orientation?: "vertical" | "horizontal";
    padding: Padding;
  } = $props();

  /** The thinnest a strip is drawn, in pixels. */
  const MIN_THICKNESS = 3;

  const horizontal = $derived(orientation === "horizontal");
  const low = $derived(domain[0]);
  const high = $derived(domain[1]);
  const scale = $derived(scaleSymlog().constant(constant));
  const band = $derived(scaleBand().padding(0.35));
  const ticks = $derived(
    valueTicks(low, high, constant, format, { horizontal, labelLow: horizontal })
  );
  const drawn = $derived(rows.filter((row) => plots[row.id]?.boxes.length));
</script>

<Chart
  data={drawn}
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
    {@const full = across.bandwidth?.() ?? 0}
    <Svg>
      <Axis placement={horizontal ? "bottom" : "left"} grid rule {ticks} {format} />
      <ChartClipPath>
        {#each drawn as row (row.id)}
          {@const plot = plots[row.id]}
          {@const start = across(row.id)}
          {@const middle = start + full / 2}
          {@const deepest = Math.max(...plot.boxes.map((box) => box.depth))}
          {#each letterSegments(plot.boxes) as segment (`${segment.depth}:${segment.from}`)}
            {@const thickness = Math.max(MIN_THICKNESS, full * segment.share)}
            {@const from = Math.min(value(segment.from), value(segment.to))}
            {@const length = Math.max(1, Math.abs(value(segment.to) - value(segment.from)))}
            {@const fade = deepest > 2 ? (segment.depth - 2) / (deepest - 2) : 0}
            <rect
              x={horizontal ? from : middle - thickness / 2}
              y={horizontal ? middle - thickness / 2 : from}
              width={horizontal ? length : thickness}
              height={horizontal ? thickness : length}
              fill={row.color}
              fill-opacity={0.6 - 0.45 * fade}
              data-letter-depth={segment.depth}
            />
          {/each}
          <line
            x1={horizontal ? value(plot.median) : start}
            x2={horizontal ? value(plot.median) : start + full}
            y1={horizontal ? start : value(plot.median)}
            y2={horizontal ? start + full : value(plot.median)}
            stroke={row.color}
            stroke-width="2"
          />
          {@const outliers = [...plot.low, ...plot.high]}
          {#each dotOffsets(outliers.length) as share, index (index)}
            <circle
              cx={horizontal ? value(outliers[index]) : start + full * share}
              cy={horizontal ? start + full * share : value(outliers[index])}
              r="2.5"
              fill={row.color}
              fill-opacity="0.5"
              class="pointer-events-none"
            />
          {/each}
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
