<script lang="ts">
  /**
   * One box per Group on a shared axis, drawn from the five-number summary the
   * backend already computed.
   *
   * The axis is symlog, not log: a duration of zero is ordinary here, a
   * Transition Time goes negative when two activities of a case overlap, and
   * `log(0)` does not exist. Its `constant` is where the axis stops being
   * linear, defaulting to the widest box so one far value cannot squeeze every
   * box to a sliver. The lines run to the extremes, so nothing counted is left
   * off the plot.
   */
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Highlight, Svg, Tooltip } from "layerchart";
  import type { BoxRow } from "$lib/analysis/types";
  import { formatNumber } from "$lib/format";

  let {
    boxes,
    format,
    orientation = "vertical",
    ladder = [],
    constant,
    contain = "container"
  }: {
    boxes: BoxRow[];
    format: (value: number) => string;
    orientation?: "vertical" | "horizontal";
    ladder?: number[];
    constant?: number;
    contain?: "container" | "window";
  } = $props();

  const horizontal = $derived(orientation === "horizontal");

  const low = $derived(Math.min(...boxes.map((box) => box.min)));
  const high = $derived(Math.max(...boxes.map((box) => box.max)));

  /** Every value identical: a scale with nowhere to put a mark. */
  const flat = $derived(boxes.length === 0 || !(high > low));

  const linearBelow = $derived.by(() => {
    if (constant !== undefined && constant > 0) return constant;
    const widest = Math.max(...boxes.map((box) => box.q3 - box.q1), 0);
    return widest > 0 ? widest : Math.max((high - low) / 8, Number.MIN_VALUE);
  });

  const scale = $derived(scaleSymlog().constant(linearBelow));

  /**
   * Rungs strictly inside the span, at most one per label: every duration under
   * half a second formats to "0s", and a repeated label reads as a misplaced
   * axis end. Zero earns one when the span straddles it. Fewer than two leaves
   * the scale to tick itself.
   */
  const ticks = $derived.by(() => {
    const rungs = ladder.length > 0 ? ladder : scale.copy().domain([low, high]).ticks(4);
    const seen = new Set<string>();
    const kept: number[] = [];
    for (const value of low < 0 && high > 0 ? [0, ...rungs] : rungs) {
      if (!(value > low && value < high)) continue;
      const label = format(value);
      if (seen.has(label)) continue;
      seen.add(label);
      kept.push(value);
    }
    return kept.length >= 2 ? kept : undefined;
  });

  const band = $derived(scaleBand().padding(0.35));

  const truncate = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);

  /** A Group whose cases all share one value has no box, so it draws as a dot. */
  const center = (axis: { (value: string): number; bandwidth?: () => number }, group: string) =>
    axis(group) + (axis.bandwidth?.() ?? 0) / 2;
</script>

{#if flat}
  <p class="flex flex-1 items-center justify-center p-3 text-center text-xs">
    All values are <span class="ml-1 font-semibold">{format(boxes[0]?.median ?? 0)}</span>.
  </p>
{:else}
  <div
    class={horizontal ? "h-[calc(1.75rem*var(--rows)+1.25rem)] w-full" : "h-64 w-full px-3 py-2"}
    style="--rows:{boxes.length}"
  >
    <Chart
      data={boxes}
      x={horizontal ? "median" : "group"}
      y={horizontal ? "group" : "median"}
      xScale={horizontal ? scale : band}
      yScale={horizontal ? band : scale}
      xDomain={horizontal ? [low, high] : undefined}
      yDomain={horizontal ? undefined : [low, high]}
      valueAxis={horizontal ? "x" : "y"}
      tooltipContext={{ mode: "band" }}
      padding={horizontal
        ? { left: 76, right: 8, bottom: 20 }
        : { left: 52, right: 12, bottom: 24, top: 8 }}
    >
      {#snippet children({ context })}
        <Svg>
          {#if horizontal}
            <Axis
              placement="left"
              rule
              grid={false}
              format={truncate}
              tickLabelProps={{ svgProps: { x: -8 } }}
            />
            <Axis placement="bottom" grid rule {ticks} {format} />
          {:else}
            <Axis placement="left" grid rule {ticks} {format} />
            <Axis placement="bottom" rule format={truncate} />
          {/if}
          <!-- Nothing an SVG layer draws is clipped by default, so a mark with a
               coordinate outside the plot is painted across the page. -->
          <ChartClipPath>
            {#each boxes as box (box.group)}
              {#if box.min === box.max}
                <circle
                  cx={horizontal ? context.xScale(box.median) : center(context.xScale, box.group)}
                  cy={horizontal ? center(context.yScale, box.group) : context.yScale(box.median)}
                  r="4"
                  fill={box.color}
                  fill-opacity="0.18"
                  stroke={box.color}
                  stroke-width="1.5"
                />
              {:else}
                <BoxPlot
                  data={box}
                  min="min"
                  q1="q1"
                  median="median"
                  q3="q3"
                  max="max"
                  fill={box.color}
                  fillOpacity={0.18}
                  stroke={box.color}
                  strokeWidth={1.5}
                />
              {/if}
            {/each}
            <Highlight area />
          </ChartClipPath>
        </Svg>

        <!-- Kept small and contained: both views sit in a scroll viewport, so
             anything pushed outside is clipped. -->
        <Tooltip.Root contained={contain} props={{ root: { class: "w-max" } }}>
          {#snippet children({ data: box })}
            <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
              <p class="mb-1 text-[0.6875rem] font-semibold">{box.group}</p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[0.625rem]">
                {#each [["Max", format(box.max)], ["Q3", format(box.q3)], ["Median", format(box.median)], ["Q1", format(box.q1)], ["Min", format(box.min)], ["IQR", format(box.q3 - box.q1)], ...(box.n === undefined ? [] : [["n", formatNumber(box.n)]])] as [label, value] (label)}
                  <dt class="text-muted-foreground">{label}</dt>
                  <dd class="text-right whitespace-nowrap">{value}</dd>
                {/each}
              </dl>
            </div>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </Chart>
  </div>
{/if}
