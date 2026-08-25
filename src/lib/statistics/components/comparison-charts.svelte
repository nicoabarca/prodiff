<script lang="ts">
  import { BarChart } from "layerchart";
  import { cubicInOut } from "svelte/easing";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { colorVar, formatDecimal, formatDuration, formatNumber } from "$lib/format";
  import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
  import type { Group } from "$lib/groups/types";

  let {
    groups,
    stats
  }: { groups: Group[]; stats: Record<string, ResponseEventLogStats> } = $props();

  /** One metric across every Group: `value` scales the bar, `display` labels it. */
  interface ChartDef {
    title: string;
    unit: string;
    value: (s: ResponseEventLogStats) => number;
    display: (s: ResponseEventLogStats) => string;
  }

  const CHARTS: ChartDef[] = [
    {
      title: "Cases",
      unit: "total cases",
      value: (s) => s.cases,
      display: (s) => formatNumber(s.cases)
    },
    {
      title: "Events",
      unit: "total events",
      value: (s) => s.events,
      display: (s) => formatNumber(s.events)
    },
    {
      title: "Variants",
      unit: "distinct paths",
      value: (s) => s.variants,
      display: (s) => formatNumber(s.variants)
    },
    {
      title: "Avg. events / case",
      unit: "per case",
      value: (s) => s.avgEventsPerCase,
      display: (s) => formatDecimal(s.avgEventsPerCase)
    },
    {
      title: "Median case duration",
      unit: "lower is faster",
      value: (s) => s.medianCaseDurationMs ?? 0,
      display: (s) => formatDuration(s.medianCaseDurationMs)
    },
    {
      title: "Avg. case duration",
      unit: "lower is faster",
      value: (s) => s.avgCaseDurationMs ?? 0,
      display: (s) => formatDuration(s.avgCaseDurationMs)
    }
  ];

  const ready = $derived(groups.filter((group) => stats[group.id]));

  const colors = $derived(ready.map((group) => colorVar(group.color)));

  const config = $derived(
    Object.fromEntries(
      ready.map((group) => [
        group.id,
        { label: group.name, color: colorVar(group.color) }
      ])
    ) satisfies Chart.ChartConfig
  );

  function truncate(name: string): string {
    return name.length > 13 ? `${name.slice(0, 12)}…` : name;
  }

  function series(chart: ChartDef) {
    return ready.map((group) => ({
      id: group.id,
      name: group.name,
      color: colorVar(group.color),
      value: chart.value(stats[group.id]),
      display: chart.display(stats[group.id])
    }));
  }
</script>

<Card.Root class="gap-0 py-0">
  <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-4 py-3">
    <span class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">Comparison charts</span>
    <span class="text-muted-foreground text-xs">
      Visual read of each metric across groups.
    </span>
    <div class="ml-auto flex flex-wrap items-center gap-3">
      {#each ready as group (group.id)}
        <span class="text-muted-foreground inline-flex items-center gap-1.5 text-[0.6875rem]">
          <span
            class="size-2.5 shrink-0"
            style="background:{colorVar(group.color)}"
            aria-hidden="true"
          ></span>
          {group.name}
        </span>
      {/each}
    </div>
  </div>

  <div class="bg-border grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-px">
    {#each CHARTS as chart (chart.title)}
      <div class="bg-card flex flex-col gap-2 px-4 py-3.5">
        <div class="flex items-baseline gap-1.5">
          <span class="text-[0.8125rem] font-semibold">{chart.title}</span>
          <span class="text-muted-foreground text-[0.625rem]">{chart.unit}</span>
        </div>
        {#if ready.length === 0}
          <div class="flex flex-col gap-2 py-1">
            {#each { length: 3 } as _, bar (bar)}
              <Skeleton class="h-3 w-full" />
            {/each}
          </div>
        {:else}
          {@const data = series(chart)}
          <Chart.Container
            {config}
            class="aspect-auto h-[calc(1.5rem*var(--bars))] w-full"
            style="--bars:{data.length}"
          >
            <BarChart
              {data}
              orientation="horizontal"
              x="value"
              y="name"
              c="color"
              cRange={colors}
              axis="y"
              grid={false}
              rule={false}
              legend={false}
              bandPadding={0.25}
              tooltipContext={false}
              padding={{ left: 96, right: 52 }}
              props={{
                bars: {
                  stroke: "none",
                  radius: 4,
                  rounded: "all",
                  motion: { type: "tween", duration: 500, easing: cubicInOut }
                },
                highlight: { area: { fill: "none" } },
                // The axis gutter is fixed, so a long group name is cut.
                yAxis: {
                  format: truncate,
                  tickLabelProps: { svgProps: { x: -12 } }
                }
              }}
              labels={{
                placement: "outside",
                format: (value: number) =>
                  data.find((point) => point.value === value)?.display ?? String(value)
              }}
            />
          </Chart.Container>
        {/if}
      </div>
    {/each}
  </div>
</Card.Root>
