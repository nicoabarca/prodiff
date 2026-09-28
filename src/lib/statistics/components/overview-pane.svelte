<script lang="ts">
  import { colorVar, formatNumber } from "$lib/format";
  import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
  import type { Group } from "$lib/groups/types";
  import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import { formatSigned, isGap, share } from "$lib/statistics/utils/change";
  import {
    OVERVIEW_METRICS,
    biggestDifferences,
    metricFigure,
    type Pane
  } from "$lib/statistics/utils/figures";
  import ColumnHead from "$lib/statistics/components/column-head.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";

  let {
    groups,
    stats,
    comparison,
    onpane
  }: {
    groups: Group[];
    stats: Record<string, ResponseEventLogStats>;
    comparison: ResponseGroupComparison;
    onpane: (pane: Pane) => void;
  } = $props();

  const PANE_LABELS: Record<Pane, string> = {
    overview: "Overview",
    duration: "Case duration",
    activities: "Activities",
    attributes: "Attributes",
    variants: "Variants"
  };

  /** A change this big, in percent, fills the bar's reach on its side. */
  const FULL_SCALE = 15;

  const ids = $derived(groups.map((group) => group.id));
  const pair = $derived(groups.length === 2);
  const rows = $derived(
    OVERVIEW_METRICS.map((metric) => ({ metric, figure: metricFigure(metric, ids, stats) }))
  );
  const differences = $derived(biggestDifferences(comparison, ids));
  const [a, b] = $derived(groups.map((group) => stats[group.id]));
  const size = $derived(a && b ? share(b.cases, a.cases) : null);

  const half = (delta: number) => Math.min(Math.abs(delta) / FULL_SCALE, 1) * 36;
  import GroupName from "$lib/statistics/components/group-name.svelte";
</script>

<div class="flex flex-col">
  {#if pair && a && b && size !== null}
    <div class="bg-sidebar flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b px-4.5 py-3">
      <span class="text-muted-foreground text-[0.625rem] font-bold tracking-widest uppercase">
        Size
      </span>
      <span class="bg-muted relative h-1.5 w-56">
        <span
          class="absolute inset-y-0 left-0"
          style="width:{Math.min(size, 100)}%; background:{colorVar(groups[1].color)}"
        ></span>
      </span>
      <span class="text-xs">
        <GroupName group={groups[1]} /> holds <strong>{size.toFixed(1)}%</strong> as many cases as
        <GroupName group={groups[0]} />
      </span>
      <span class="text-muted-foreground ml-auto font-mono text-[0.6875rem]">
        {formatNumber(b.cases)} / {formatNumber(a.cases)} cases · {formatNumber(b.events)} /
        {formatNumber(a.events)} events
      </span>
    </div>
  {/if}

  <div class="bg-card pt-2.5 pb-1">
    <ColumnHead class="bg-card! pt-0">
      <span class="min-w-44 flex-1">Metric</span>
      {#each groups as group (group.id)}
        <span class="flex w-28 shrink-0 justify-end"><GroupName {group} /></span>
      {/each}
      {#if pair}
        <span class="w-72 shrink-0 text-center">lower ← change → higher</span>
        <span class="w-3.5 shrink-0"></span>
      {/if}
    </ColumnHead>
    {#each rows as { metric, figure } (metric.label)}
      {@const delta = figure.delta}
      <button
        type="button"
        class="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 border-t px-4.5 py-2 text-left"
        onclick={() => onpane(metric.pane)}
      >
        <span class="min-w-44 flex-1 text-xs">
          {metric.label}
          {#if metric.unit}
            <span class="text-muted-foreground ml-1.5 text-[0.625rem]">{metric.unit}</span>
          {/if}
        </span>
        {#each groups as group, index (group.id)}
          <span
            class="w-28 shrink-0 text-right font-mono {index === 0 && pair
              ? 'text-muted-foreground text-xs'
              : 'text-[0.8125rem] font-semibold'}"
          >
            {metric.format(figure.values[group.id] ?? null)}
          </span>
        {/each}
        {#if pair}
          <span class="relative h-5 w-72 shrink-0" aria-hidden="true">
            <span class="bg-border absolute inset-y-0 left-1/2 w-px"></span>
            {#if delta !== null && Math.abs(delta) >= 0.05}
              <span
                class="absolute top-1.25 h-2.5 {isGap(delta)
                  ? 'bg-destructive'
                  : 'bg-muted-foreground'}"
                style="left:{delta >= 0 ? 50 : 50 - half(delta)}%; width:{Math.max(
                  0.8,
                  half(delta)
                )}%"
              ></span>
            {/if}
            <span
              class="absolute top-0.75 font-mono text-[0.6875rem] whitespace-nowrap {isGap(delta)
                ? 'text-destructive'
                : 'text-muted-foreground'}"
              style={delta !== null && delta < 0
                ? `left:calc(${50 - half(delta)}% - 0.375rem); transform:translateX(-100%)`
                : `left:calc(${50 + (delta === null ? 0 : half(delta))}% + 0.375rem)`}
            >
              {delta === null
                ? "—"
                : Math.abs(delta) < 0.05
                  ? "no change"
                  : formatSigned(delta, 1, "%")}
            </span>
          </span>
          <ChevronRight class="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        {/if}
      </button>
    {/each}
    <p class="text-muted-foreground border-t px-4.5 pt-2 pb-1.5 text-[0.6875rem]">
      Cases and events are shown as size, not as a difference: a filtered group is always smaller.
    </p>
  </div>

  {#if pair}
    <div class="bg-card border-t">
      <div class="px-4.5 pt-3 pb-2 text-[0.6875rem] font-bold tracking-[0.12em] uppercase">
        Biggest differences
      </div>
      {#each differences as difference (difference.pane + difference.what)}
        <button
          type="button"
          class="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 border-t px-4.5 py-2.25 text-left"
          onclick={() => onpane(difference.pane)}
        >
          <span
            class="text-muted-foreground w-24 shrink-0 text-[0.625rem] font-bold tracking-[0.06em] uppercase"
          >
            {PANE_LABELS[difference.pane]}
          </span>
          <span class="min-w-0 flex-1 truncate text-xs">
            {difference.what}
            <span class="text-muted-foreground ml-1.5 text-[0.6875rem]">{difference.measure}</span>
          </span>
          <span class="text-destructive font-mono text-xs">{difference.label}</span>
          <ChevronRight class="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        </button>
      {:else}
        <p class="text-muted-foreground border-t px-4.5 py-3 text-xs">
          No activity, attribute value or variant differs by 5 pp or more.
        </p>
      {/each}
    </div>
  {/if}
</div>
