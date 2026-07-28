<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { colorTint, colorVar, formatDecimal, formatDuration, formatNumber } from "$lib/format";
  import type { EventLogStats } from "$lib/types";
  import type { Population } from "$lib/state/slices.svelte";

  let { populations, stats }: { populations: Population[]; stats: Record<string, EventLogStats> } =
    $props();

  interface Metric {
    label: string;
    unit?: string;
    value: (s: EventLogStats) => string;
  }

  const METRICS: Metric[] = [
    { label: "Cases", value: (s) => formatNumber(s.cases) },
    { label: "Events", value: (s) => formatNumber(s.events) },
    { label: "Activities", unit: "distinct", value: (s) => formatNumber(s.activities) },
    { label: "Variants", value: (s) => formatNumber(s.variants) },
    { label: "Avg. events / case", value: (s) => formatDecimal(s.avgEventsPerCase) },
    { label: "Median case duration", value: (s) => formatDuration(s.medianCaseDurationMs) },
    { label: "Avg. case duration", value: (s) => formatDuration(s.avgCaseDurationMs) },
    { label: "Start activities", unit: "distinct", value: (s) => formatNumber(s.startActivities) },
    { label: "End activities", unit: "distinct", value: (s) => formatNumber(s.endActivities) }
  ];
</script>

<Card.Root class="gap-0 py-0">
  <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-4 py-3">
    <span class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">Metrics</span>
    <span class="text-muted-foreground text-xs">Whole log vs. base vs. each slice.</span>
  </div>
  <Table.Root>
    <Table.Header>
      <Table.Row class="hover:bg-transparent">
        <Table.Head class="bg-sidebar sticky left-0 z-10 w-44 px-4 py-2.5"></Table.Head>
        {#each populations as population (population.id)}
          <Table.Head class="bg-sidebar h-auto min-w-28 border-l px-4 py-2.5">
            <span class="flex items-center gap-1.5">
              <span
                class="size-2.5 shrink-0"
                style="background:{colorVar(population.color)}"
                aria-hidden="true"
              ></span>
              <span class="truncate font-bold" style="color:{colorVar(population.color)}">
                {population.name}
              </span>
            </span>
            {#if stats[population.id]}
              <span class="text-muted-foreground mt-0.5 block font-mono text-[0.6875rem]">
                {formatNumber(stats[population.id].cases)} cases
              </span>
            {:else}
              <Skeleton class="mt-1 h-3 w-16" />
            {/if}
          </Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each METRICS as metric (metric.label)}
        <!-- The per-column tints paint over any row background, so a row
             hover would only light up the untinted cells. -->
        <Table.Row class="hover:bg-transparent">
          <Table.Cell class="bg-card sticky left-0 z-10 px-4 py-2">
            {metric.label}
            {#if metric.unit}
              <span class="text-muted-foreground ml-1.5 text-[0.625rem]">{metric.unit}</span>
            {/if}
          </Table.Cell>
          {#each populations as population (population.id)}
            <Table.Cell
              class="border-l px-4 py-2 font-mono text-[0.8125rem]"
              style="background:{colorTint(population.color)}"
            >
              {#if stats[population.id]}
                {metric.value(stats[population.id])}
              {:else}
                <Skeleton class="h-4 w-12" />
              {/if}
            </Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</Card.Root>
