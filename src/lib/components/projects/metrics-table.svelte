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

<Card.Root>
  <Card.Header>
    <Card.Title>Metrics</Card.Title>
    <Card.Description>Whole log versus the base population and each slice.</Card.Description>
  </Card.Header>
  <!-- Table.Root brings its own overflow container, and the card's bottom
       padding would otherwise leave a blank band under the last row. -->
  <Card.Content class="px-0 pb-0">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="bg-card sticky left-0 z-10">Metric</Table.Head>
          {#each populations as population (population.id)}
            <Table.Head class="min-w-24" style="background:{colorTint(population.color)}">
              <span class="flex items-center gap-1.5">
                <span
                  class="size-2 shrink-0 rounded-full"
                  style="background:{colorVar(population.color)}"
                  aria-hidden="true"
                ></span>
                <span class="text-foreground truncate font-semibold">{population.name}</span>
              </span>
              {#if stats[population.id]}
                <span class="text-muted-foreground block font-mono text-[0.6875rem]">
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
            <Table.Cell class="bg-card sticky left-0 z-10">
              {metric.label}
              {#if metric.unit}
                <span class="text-muted-foreground ml-1.5 text-[0.625rem]">{metric.unit}</span>
              {/if}
            </Table.Cell>
            {#each populations as population (population.id)}
              <Table.Cell class="font-mono" style="background:{colorTint(population.color)}">
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
  </Card.Content>
</Card.Root>
