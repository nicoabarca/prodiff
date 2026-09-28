<script lang="ts">
  import { formatDuration } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { GroupFigures, ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import { linearDurationAxis, logDurationAxis } from "$lib/statistics/utils/axis";
  import { formatP, formatSigned, isGap, percentChange } from "$lib/statistics/utils/change";
  import { Button } from "$lib/components/ui/button/index.js";
  import BoxRows from "$lib/statistics/components/box-rows.svelte";
  import ColumnHead from "$lib/statistics/components/column-head.svelte";
  import Segmented from "$lib/statistics/components/segmented.svelte";
  import Table2 from "@lucide/svelte/icons/table-2";

  let {
    groups,
    comparison,
    ontail
  }: {
    groups: Group[];
    comparison: ResponseGroupComparison;
    ontail: (group: Group, fromMs: number) => void;
  } = $props();

  let scale = $state<"linear" | "log">("linear");

  const pair = $derived(groups.length === 2);
  const figures = $derived(
    Object.fromEntries(comparison.groups.map((figure) => [figure.id, figure]))
  );
  const boxes = $derived(
    Object.fromEntries(groups.map((group) => [group.id, figures[group.id]?.duration ?? null]))
  );
  const drawn = $derived(Object.values(boxes).filter((box) => box !== null));
  const low = $derived(Math.min(...drawn.map((box) => box.whiskerLow)));
  const high = $derived(Math.max(...drawn.map((box) => box.whiskerHigh)));
  const axis = $derived(
    scale === "log"
      ? logDurationAxis(low, high, formatDuration)
      : linearDurationAxis(high, formatDuration)
  );

  const PERCENTILES: [string, (figure: GroupFigures) => number | null][] = [
    ["P10", (f) => f.durationP10],
    ["P25", (f) => f.duration?.q1 ?? null],
    ["Median", (f) => f.duration?.median ?? null],
    ["Mean", (f) => f.duration?.mean ?? null],
    ["P75", (f) => f.duration?.q3 ?? null],
    ["P90", (f) => f.durationP90],
    ["Max", (f) => f.duration?.max ?? null]
  ];

  const rows = $derived(
    PERCENTILES.map(([label, read]) => {
      const values = groups.map((group) => (figures[group.id] ? read(figures[group.id]) : null));
      const delta =
        pair && values[0] !== null && values[1] !== null
          ? percentChange(values[0], values[1])
          : null;
      return { label, values, delta };
    })
  );

  const tailGroup = $derived(groups[groups.length - 1]);
  const tailFrom = $derived(figures[tailGroup.id]?.durationP90 ?? null);
  const tailDelta = $derived(rows.find((row) => row.label === "P90")?.delta ?? null);
  const test = $derived(comparison.durationTest);
</script>

<div class="bg-card flex flex-col">
  <div class="flex flex-wrap items-center gap-2.5 border-b px-4.5 py-2.5">
    <span class="text-muted-foreground text-[0.6875rem]">Axis</span>
    <Segmented
      label="Axis"
      value={scale}
      options={[
        { value: "linear", label: "Linear" },
        { value: "log", label: "Log" }
      ]}
      onchange={(value) => (scale = value)}
    />
    {#if test}
      <span class="text-muted-foreground ml-auto text-[0.6875rem]">
        Mann–Whitney U · p {formatP(test.pValue)} ·
        <strong class="text-foreground font-semibold">
          {test.significant ? "significant" : "not significant"}
        </strong>
      </span>
    {:else if pair}
      <span class="text-muted-foreground ml-auto text-[0.6875rem]"> Too few cases to test </span>
    {/if}
  </div>

  <div class="px-4.5 pt-5.5 pb-3.5">
    {#if drawn.length > 0}
      <BoxRows {groups} {boxes} {axis} format={formatDuration} />
    {:else}
      <p class="text-muted-foreground text-xs">No cases to measure.</p>
    {/if}
  </div>

  <div class="border-t">
    <ColumnHead>
      <span class="w-30 shrink-0">Percentile</span>
      {#each groups as group (group.id)}
        <span class="w-28 shrink-0 truncate text-right">{group.name}</span>
      {/each}
      {#if pair}
        <span class="w-20 shrink-0 text-right">Change</span>
      {/if}
    </ColumnHead>
    {#each rows as row (row.label)}
      <div
        class="flex items-center gap-3 border-t px-4.5 py-1.75 {isGap(row.delta)
          ? 'bg-destructive/5'
          : ''}"
      >
        <span class="w-30 shrink-0 text-xs">{row.label}</span>
        {#each row.values as value, index (index)}
          <span
            class="w-28 shrink-0 text-right font-mono text-xs {index === 0 && pair
              ? 'text-muted-foreground'
              : 'font-semibold'}"
          >
            {formatDuration(value)}
          </span>
        {/each}
        {#if pair}
          <span
            class="w-20 shrink-0 text-right font-mono text-xs {isGap(row.delta)
              ? 'text-destructive'
              : 'text-muted-foreground'}"
          >
            {formatSigned(row.delta, 1, "%")}
          </span>
        {/if}
      </div>
    {/each}
  </div>

  {#if tailFrom !== null}
    <div class="flex flex-wrap items-center gap-2.5 border-t px-4.5 py-3">
      {#if pair && tailDelta !== null && Math.abs(tailDelta) >= 0.05}
        <span class="text-muted-foreground text-xs">
          {tailGroup.name}'s slowest 10% take {Math.abs(tailDelta).toFixed(1)}% {tailDelta > 0
            ? "longer"
            : "less time"} than {groups[0].name}'s.
        </span>
      {/if}
      <Button
        variant="outline"
        size="sm"
        class="ml-auto"
        onclick={() => ontail(tailGroup, tailFrom)}
      >
        <Table2 data-icon="inline-start" />
        Show {tailGroup.name} cases above P90
      </Button>
    </div>
  {/if}
</div>
