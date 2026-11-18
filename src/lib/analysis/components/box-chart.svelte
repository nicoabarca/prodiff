<script lang="ts">
  /**
   * The drawing core of a box plot: one row per Group over `domain`, plus
   * optional dots per Group and an HTML `overlay` placed in plot coordinates.
   * `hover` picks what the pointer reads: a Group's box figures, or the value
   * under it on the value axis.
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
    bandLabels = true,
    hover = "box",
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
    bandLabels?: boolean;
    hover?: "box" | "value";
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
  /** Pixels from the plot's start along the value axis to the pointer, null while it is outside. */
  let pointer = $state<number | null>(null);
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
  tooltipContext={{ mode: hover === "box" ? "band" : "manual" }}
  padding={chartPadding}
>
  {#snippet children({ context })}
    <Svg>
      {#if horizontal}
        <Axis
          placement="left"
          rule
          grid={false}
          format={bandLabels ? bandLabel : () => ""}
          tickLength={bandLabels ? 4 : 0}
          tickLabelProps={{ svgProps: { x: -8 - bandLabelOffset } }}
        />
        <Axis placement="bottom" grid rule {ticks} {format} />
      {:else}
        <Axis placement="left" grid rule {ticks} {format} />
        <Axis
          placement="bottom"
          rule
          format={bandLabels ? bandLabel : () => ""}
          tickLength={bandLabels ? 4 : 0}
          tickLabelProps={{ dy: bandLabelOffset }}
        />
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
        {#if hover === "box"}
          <Highlight area />
        {/if}
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

    {#if hover === "value"}
      {@const value = horizontal ? context.xScale : context.yScale}
      <Html>
        <div
          role="presentation"
          class="absolute inset-0 cursor-crosshair"
          onpointermove={(event) => (pointer = horizontal ? event.offsetX : event.offsetY)}
          onpointerleave={() => (pointer = null)}
        >
          {#if pointer !== null}
            {#if horizontal}
              <div
                class="bg-foreground/40 pointer-events-none absolute inset-y-0 w-px"
                style="left:{pointer}px"
              ></div>
              <span
                class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full -translate-x-1/2 border px-1 py-0.5 font-mono text-[0.625rem] whitespace-nowrap tabular-nums"
                style="left:{pointer}px"
              >
                {format(value.invert(pointer))}
              </span>
            {:else}
              <div
                class="bg-foreground/40 pointer-events-none absolute inset-x-0 h-px"
                style="top:{pointer}px"
              ></div>
              <span
                class="bg-popover text-popover-foreground border-border pointer-events-none absolute right-full -translate-y-1/2 border px-1 py-0.5 font-mono text-[0.625rem] whitespace-nowrap tabular-nums"
                style="top:{pointer}px"
              >
                {format(value.invert(pointer))}
              </span>
            {/if}
          {/if}
        </div>
      </Html>
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
