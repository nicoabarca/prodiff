<script lang="ts">
  /**
   * The drawing core of a box plot: one row per Group over `domain`, plus
   * optional dots per Group and an HTML `overlay` placed in plot coordinates.
   */
  import type { Snippet } from "svelte";
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Highlight, Html, Svg, Tooltip } from "layerchart";
  import { interiorTicks } from "$lib/analysis/utils/axis";
  import { dotOffsets, type BoxRow } from "$lib/analysis/utils/box-plot";

  type Padding = { top?: number; right?: number; bottom?: number; left?: number };
  /** `value` maps a value onto the value axis, `band` a Group id to the middle of its band. */
  type Place = { value: (value: number) => number; band: (id: string) => number };

  let {
    rows,
    domain,
    constant,
    format,
    formatCount,
    ladder = [],
    orientation = "vertical",
    contain = "container",
    padding,
    bandLabelOffset = 0,
    dots,
    overlay
  }: {
    rows: BoxRow[];
    domain: [number, number];
    constant: number;
    format: (value: number) => string;
    formatCount: (value: number) => string;
    ladder?: number[];
    orientation?: "vertical" | "horizontal";
    contain?: "container" | "window";
    padding?: Padding;
    bandLabelOffset?: number;
    dots?: Record<string, number[]>;
    overlay?: Snippet<[Place]>;
  } = $props();

  const horizontal = $derived(orientation === "horizontal");
  const low = $derived(domain[0]);
  const high = $derived(domain[1]);
  const scale = $derived(scaleSymlog().constant(constant));
  const position = $derived(scale.copy().domain([low, high]).range([0, 1]));
  // A label lies along a horizontal axis and stacks up a vertical one, so it
  // needs the room its own text takes in that direction.
  const clearance = $derived(horizontal ? 0.16 : 0.07);
  const ticks = $derived.by(() =>
    interiorTicks(
      low,
      high,
      ladder.length > 0
        ? ladder
        : scale
            .copy()
            .domain([low, high])
            .ticks(horizontal ? 3 : 4),
      format,
      position,
      clearance
    )
  );
  const band = $derived(scaleBand().padding(0.35));
  const chartPadding = $derived(
    padding ??
      (horizontal
        ? { left: 76, right: 8, bottom: 20 }
        : { left: 52, right: 12, bottom: 24, top: 8 })
  );
  const truncate = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);
  /** The band axis is keyed on Group id, so it reads the name back to label a tick. */
  const bandLabel = (id: string) => truncate(rows.find((row) => row.id === id)?.name ?? id);
  const center = (axis: { (value: string): number; bandwidth?: () => number }, id: string) =>
    axis(id) + (axis.bandwidth?.() ?? 0) / 2;
  const across = (
    axis: { (value: string): number; bandwidth?: () => number },
    id: string,
    share: number
  ) => axis(id) + (axis.bandwidth?.() ?? 0) * share;
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
  tooltipContext={{ mode: "band" }}
  padding={chartPadding}
>
  {#snippet children({ context })}
    <Svg>
      {#if horizontal}
        <Axis
          placement="left"
          rule
          grid={false}
          format={bandLabel}
          tickLabelProps={{ svgProps: { x: -8 - bandLabelOffset } }}
        />
        <Axis placement="bottom" grid rule {ticks} {format} />
      {:else}
        <Axis placement="left" grid rule {ticks} {format} />
        <Axis placement="bottom" rule format={bandLabel} tickLabelProps={{ dy: bandLabelOffset }} />
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
            {@const values = dots[box.id] ?? []}
            {#each dotOffsets(values.length) as share, index (index)}
              <circle
                cx={horizontal
                  ? context.xScale(values[index])
                  : across(context.xScale, box.id, share)}
                cy={horizontal
                  ? across(context.yScale, box.id, share)
                  : context.yScale(values[index])}
                r="2.5"
                fill={box.color}
                fill-opacity="0.5"
                class="pointer-events-none"
              />
            {/each}
          {/if}
        {/each}
        <Highlight area />
      </ChartClipPath>
    </Svg>

    {#if overlay}
      <Html pointerEvents={false}>
        {@render overlay({
          value: (value) => (horizontal ? context.xScale(value) : context.yScale(value)),
          band: (id) => (horizontal ? center(context.yScale, id) : center(context.xScale, id))
        })}
      </Html>
    {/if}

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
  {/snippet}
</Chart>
