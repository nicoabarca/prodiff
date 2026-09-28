<script lang="ts">
  import { formatDecimal, formatDuration } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import { formatSigned, isGap, share } from "$lib/statistics/utils/change";
  import {
    ACTIVITY_MEASURE_LABELS,
    activityFigures,
    measureUnit,
    type ActivityMeasure
  } from "$lib/statistics/utils/figures";
  import ColumnHead from "$lib/statistics/components/column-head.svelte";
  import PairBars from "$lib/statistics/components/pair-bars.svelte";
  import Segmented from "$lib/statistics/components/segmented.svelte";

  let { groups, comparison }: { groups: Group[]; comparison: ResponseGroupComparison } = $props();

  let measure = $state<ActivityMeasure>("share");

  const ids = $derived(groups.map((group) => group.id));
  const pair = $derived(groups.length === 2);
  const figures = $derived(activityFigures(comparison, ids, measure));
  const max = $derived(
    Math.max(0, ...figures.flatMap((figure) => Object.values(figure.values).map((v) => v ?? 0)))
  );
  const gaps = $derived(figures.filter((figure) => isGap(figure.delta)).length);
  const unit = $derived(measureUnit(measure));
  const format = $derived((value: number | null) =>
    value === null
      ? "—"
      : measure === "share"
        ? `${value.toFixed(1)}%`
        : measure === "epc"
          ? formatDecimal(value)
          : formatDuration(value)
  );
  const options = $derived(
    (comparison.hasActivityDuration
      ? (["share", "epc", "time"] as const)
      : (["share", "epc"] as const)
    ).map((value) => ({ value, label: ACTIVITY_MEASURE_LABELS[value] }))
  );

  /** The commonest start or end activity per Group, with its share of cases. */
  const endpoints = $derived(
    (["startActivities", "endActivities"] as const).map((key) => ({
      kind: key === "startActivities" ? "Start activity" : "End activity",
      byGroup: groups.map((group) => {
        const figure = comparison.groups.find((g) => g.id === group.id);
        const counts = Object.entries(figure?.[key] ?? {}).sort((x, y) => y[1] - x[1]);
        const [name, count] = counts[0] ?? ["—", 0];
        return {
          group,
          name,
          share: share(count, figure?.cases ?? 0),
          distinct: counts.length
        };
      })
    }))
  );
  import GroupName from "$lib/statistics/components/group-name.svelte";
</script>

<div class="bg-card flex flex-col">
  <div class="flex flex-wrap items-center gap-2.5 border-b px-4.5 py-2.5">
    <span class="text-muted-foreground text-[0.6875rem]">Measure</span>
    <Segmented label="Measure" value={measure} {options} onchange={(value) => (measure = value)} />
    {#if pair}
      <span class="text-muted-foreground ml-auto text-[0.6875rem]">
        Sorted by size of difference · {gaps} differ by 5 {unit} or more
      </span>
    {/if}
  </div>
  <ColumnHead>
    <span class="w-56 shrink-0">Activity</span>
    <span class="min-w-0 flex-1">{ACTIVITY_MEASURE_LABELS[measure]}</span>
    {#each groups as group (group.id)}
      <span class="flex w-20 shrink-0 justify-end"><GroupName {group} /></span>
    {/each}
    {#if pair}
      <span class="w-16 shrink-0 text-right">Δ {unit}</span>
    {/if}
  </ColumnHead>
  {#each figures as figure (figure.name)}
    {@const gap = isGap(figure.delta)}
    <div class="flex items-center gap-3 border-t px-4.5 py-1.75 {gap ? 'bg-destructive/5' : ''}">
      <span
        class="w-56 shrink-0 truncate text-xs {gap ? 'text-foreground' : 'text-foreground/75'}"
        title={figure.name}
      >
        {figure.name}
      </span>
      <span class="min-w-0 flex-1"><PairBars {groups} values={figure.values} {max} /></span>
      {#each groups as group, index (group.id)}
        <span
          class="w-20 shrink-0 text-right font-mono text-xs {index === 0 && pair
            ? 'text-muted-foreground'
            : 'font-semibold'}"
        >
          {format(figure.values[group.id] ?? null)}
        </span>
      {/each}
      {#if pair}
        <span
          class="w-16 shrink-0 text-right font-mono text-xs {gap
            ? 'text-destructive'
            : 'text-muted-foreground'}"
        >
          {formatSigned(figure.delta, 1, unit === "%" ? "%" : "")}
        </span>
      {/if}
    </div>
  {/each}
  <div class="bg-border grid grid-cols-2 gap-px border-t">
    {#each endpoints as endpoint (endpoint.kind)}
      <div class="bg-card flex flex-col gap-1.5 px-4.5 py-3">
        <span class="text-muted-foreground text-[0.625rem] font-bold tracking-[0.06em] uppercase">
          {endpoint.kind}
        </span>
        {#each endpoint.byGroup as entry (entry.group.id)}
          <span class="flex items-baseline gap-2.5">
            <span class="w-56 shrink-0 truncate text-xs font-semibold">{entry.name}</span>
            <span class="text-muted-foreground font-mono text-[0.6875rem]">
              <GroupName group={entry.group} /> · {entry.share.toFixed(0)}%{entry.distinct > 1
                ? ` · ${entry.distinct} distinct`
                : ""}
            </span>
          </span>
        {/each}
      </div>
    {/each}
  </div>
</div>
