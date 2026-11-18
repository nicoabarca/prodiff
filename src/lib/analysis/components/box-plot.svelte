<script lang="ts">
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Highlight, Html, Svg, Tooltip } from "layerchart";
  import type { BoxStats } from "$lib/analysis/types";
  import { interiorTicks } from "$lib/analysis/utils/axis";
  import Fit from "$lib/components/fit/fit.svelte";

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

  const rows = $derived(
    groups.flatMap((group) => {
      const box = boxes[group.id];
      return box ? [{ id: group.id, name: group.name, color: group.color, ...box }] : [];
    })
  );
  const horizontal = $derived(orientation === "horizontal");
  const low = $derived(Math.min(...rows.map((box) => box.whiskerLow)));
  const high = $derived(Math.max(...rows.map((box) => box.whiskerHigh)));
  const flat = $derived(rows.length === 0 || !(high > low));
  const linearBelow = $derived.by(() => {
    if (constant !== undefined && constant > 0) return constant;
    const widest = Math.max(...rows.map((box) => box.q3 - box.q1), 0);
    return widest > 0 ? widest : Math.max((high - low) / 8, Number.MIN_VALUE);
  });
  const scale = $derived(scaleSymlog().constant(linearBelow));
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
  const outliers = $derived(
    rows
      .map((box) => {
        const parts = [
          box.outliersHigh > 0 &&
            `${formatCount(box.outliersHigh)} over ${format(box.whiskerHigh)}`,
          box.outliersLow > 0 && `${formatCount(box.outliersLow)} under ${format(box.whiskerLow)}`
        ].filter(Boolean);
        return parts.length > 0 ? `${box.name}: ${parts.join(", ")}, not plotted` : null;
      })
      .filter((note): note is string => note !== null)
  );
  /** The band axis draws ticks only; the Group names sit in the `Html` layer, where `Fit` can cut them. */
  const noLabel = () => "";
  const center = (axis: { (value: string): number; bandwidth?: () => number }, id: string) =>
    axis(id) + (axis.bandwidth?.() ?? 0) / 2;
</script>

{#if flat}
  <p class="flex flex-1 items-center justify-center p-3 text-center text-xs">
    All values are <span class="ml-1 font-semibold">{format(rows[0]?.median ?? 0)}</span>.
  </p>
{:else}
  <div class={horizontal ? "w-full min-w-0" : ""}>
    <div
      class={horizontal ? "h-[calc(1.75rem*var(--rows)+1.25rem)] w-full" : "h-64 w-full px-3 py-2"}
      style="--rows:{rows.length}"
    >
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
        padding={horizontal
          ? { left: 120, right: 8, bottom: 20 }
          : { left: 52, right: 12, bottom: 24, top: 8 }}
      >
        {#snippet children({ context })}
          <Svg>
            {#if horizontal}
              <Axis placement="left" rule grid={false} format={noLabel} />
              <Axis placement="bottom" grid rule {ticks} {format} />
            {:else}
              <Axis placement="left" grid rule {ticks} {format} />
              <Axis placement="bottom" rule format={noLabel} />
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
              {/each}
              <Highlight area />
            </ChartClipPath>
          </Svg>

          <!-- The tooltip hit areas are a full-size SVG drawn above `children`; `zIndex` lifts the labels over it. -->
          <Html pointerEvents={false} zIndex={1}>
            {#each rows as box (box.id)}
              {#if horizontal}
                <div
                  class="pointer-events-auto absolute right-[calc(100%+0.5rem)] flex w-28 -translate-y-1/2 justify-end text-[0.625rem] font-light"
                  style:top="{center(context.yScale, box.id)}px"
                >
                  <Fit text={box.name} class="block" />
                </div>
              {:else}
                <div
                  class="pointer-events-auto absolute top-[calc(100%+0.25rem)] flex -translate-x-1/2 justify-center text-[0.625rem] font-light"
                  style:left="{center(context.xScale, box.id)}px"
                  style:width="{context.xScale.bandwidth?.() ?? 0}px"
                >
                  <Fit text={box.name} class="block" />
                </div>
              {/if}
            {/each}
          </Html>

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
    </div>
    {#if outliers.length > 0}
      <p class="text-muted-foreground px-3 pb-2 text-[0.625rem]">{outliers.join(" · ")}.</p>
    {/if}
  </div>
{/if}
