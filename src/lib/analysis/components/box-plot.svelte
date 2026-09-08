<script lang="ts">
  import { scaleBand, scaleSymlog } from "d3-scale";
  import { Axis, BoxPlot, Chart, ChartClipPath, Highlight, Svg, Tooltip } from "layerchart";
  import type { BoxStats } from "$lib/analysis/types";
  import { interiorTicks } from "$lib/analysis/utils/axis";

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
  const ticks = $derived.by(() =>
    interiorTicks(
      low,
      high,
      ladder.length > 0 ? ladder : scale.copy().domain([low, high]).ticks(4),
      format
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
  const truncate = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);
  const center = (axis: { (value: string): number; bandwidth?: () => number }, id: string) =>
    axis(id) + (axis.bandwidth?.() ?? 0) / 2;
</script>

{#if flat}
  <p class="flex flex-1 items-center justify-center p-3 text-center text-xs">
    All values are <span class="ml-1 font-semibold">{format(rows[0]?.median ?? 0)}</span>.
  </p>
{:else}
  <div class={horizontal ? "min-w-0 flex-1" : ""}>
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
              <Axis
                placement="bottom"
                rule
                format={(id: string) =>
                  truncate(groups.find((group) => group.id === id)?.name ?? id)}
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
              {/each}
              <Highlight area />
            </ChartClipPath>
          </Svg>

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
