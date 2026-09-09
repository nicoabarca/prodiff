<script lang="ts">
  import { BarChart, Tooltip } from "layerchart";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import BoxPlot from "$lib/analysis/components/box-plot.svelte";
  import { colorVar, formatDecimal, formatDuration, formatNumber } from "$lib/format";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Summary } from "$lib/analysis/types";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";

  let {
    summaries,
    compare = true,
    duration = false
  }: {
    summaries: Record<string, Summary | null>;
    compare?: boolean;
    duration?: boolean;
  } = $props();

  const groups = $derived(comparedGroups());

  /** The Groups drawn, in order. Without comparison only the first is drawn. */
  const drawn = $derived(compare ? groups : groups.slice(0, 1));

  const accent = $derived(
    Object.fromEntries(drawn.map((group) => [group.id, colorVar(group.color)]))
  );

  /** How many categories fit before the rest go behind the disclosure. */
  const TOP = 6;

  const PAD_LEFT = 84;
  const PAD_RIGHT = 60;

  const format = (value: number) =>
    duration ? formatDuration(value) : formatDecimal(value, Math.abs(value) < 10 ? 2 : 0);

  // ---------------------------------------------------------------- numeric

  const numeric = $derived.by(() => {
    const entries = drawn.map((group) => {
      const summary = summaries[group.id] ?? null;
      return [group.id, summary?.type === "numerical" ? summary : null] as const;
    });
    return Object.fromEntries(entries) as Record<
      string,
      Extract<Summary, { type: "numerical" }> | null
    >;
  });

  const isNumeric = $derived(drawn.some((group) => numeric[group.id] !== null));

  const boxGroups = $derived(
    drawn
      .filter((group) => numeric[group.id] !== null)
      .map((group) => ({ ...group, color: accent[group.id] }))
  );
  const constant = $derived(
    boxGroups.filter((group) => numeric[group.id]?.whiskerLow === numeric[group.id]?.whiskerHigh)
  );
  const allConstant = $derived(boxGroups.length > 0 && constant.length === boxGroups.length);

  /** The headline the numeric block leads with, in the user's own group names. */
  const delta = $derived.by(() => {
    if (!compare || drawn.length !== 2) return null;
    const [baseline, other] = drawn;
    const from = numeric[baseline.id];
    const to = numeric[other.id];
    if (!from || !to) return null;
    const difference = to.median - from.median;
    if (difference === 0) return { same: true } as const;
    const percent = from.median === 0 ? null : (difference / Math.abs(from.median)) * 100;
    return {
      same: false,
      leader: difference > 0 ? other.name : baseline.name,
      word: duration ? "longer" : "higher",
      amount: format(Math.abs(difference)),
      percent
    } as const;
  });

  // ------------------------------------------------------------ categorical

  const categories = $derived.by(() => {
    const counts = Object.fromEntries(
      drawn.map((group) => {
        const summary = summaries[group.id] ?? null;
        return [group.id, summary?.type === "categorical" ? summary.counts : {}];
      })
    ) as Record<string, Record<string, number>>;
    const totals = Object.fromEntries(
      drawn.map((group) => [
        group.id,
        Object.values(counts[group.id]).reduce((sum, n) => sum + n, 0) || 1
      ])
    );
    const names = [...new Set(drawn.flatMap((group) => Object.keys(counts[group.id])))];
    return names.map((name) => {
      const perGroup = Object.fromEntries(
        drawn.map((group) => [group.id, counts[group.id][name] ?? 0])
      );
      const shares = Object.fromEntries(
        drawn.map((group) => [group.id, (perGroup[group.id] / totals[group.id]) * 100])
      );
      const first = drawn[0]?.id;
      const last = drawn.at(-1)?.id;
      const gap = drawn.length > 1 ? shares[last!] - shares[first!] : 0;
      return { name, counts: perGroup, shares, gap };
    });
  });

  /**
   * What the bars encode: the gap with two Groups, plain share with one.
   * Colour follows the Group the value leans towards.
   */
  const bars = $derived(
    compare && drawn.length > 1
      ? categories
          .map((c) => ({ ...c, value: c.gap, side: c.gap < 0 ? drawn[0].id : drawn.at(-1)!.id }))
          .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
      : categories
          .map((c) => ({ ...c, value: c.shares[drawn[0]?.id] ?? 0, side: drawn[0]?.id ?? "" }))
          .sort((x, y) => y.value - x.value)
  );

  let expanded = $state(false);
  const shown = $derived(expanded ? bars : bars.slice(0, TOP));

  /**
   * Scaled to the largest gap across *every* category, not just the shown ones,
   * so expanding the list never rescales bars already read. The headroom keeps
   * the longest bar's label clear of the category-name gutter.
   */
  const domain = $derived.by((): [number, number] => {
    const largest = Math.max(...bars.map((b) => Math.abs(b.value)), 0.1);
    return compare ? [-largest * 1.55, largest * 1.55] : [0, largest * 1.3];
  });

  const barLabel = (value: number) => {
    if (!compare) return `${value.toFixed(1)}%`;
    // No sign under 0.05: rounding turns a 0.04 gap into a direction it does not have.
    const sign = Math.abs(value) < 0.05 ? "" : value > 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(1)} pp`;
  };

  const truncate = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);
</script>

{#if isNumeric && boxGroups.length > 0}
  <div class="flex flex-col gap-2">
    {#if delta}
      <p class="text-[0.6875rem]">
        {#if delta.same}
          Same median in every group.
        {:else}
          <span class="font-semibold">{delta.leader}</span>
          {delta.word} by {delta.amount} at the median
          {#if delta.percent !== null}
            <span class="text-muted-foreground">· {Math.abs(delta.percent).toFixed(0)}%</span>
          {/if}
        {/if}
      </p>
    {/if}

    {#if !allConstant}
      <BoxPlot
        boxes={numeric}
        groups={boxGroups}
        {format}
        formatCount={formatNumber}
        orientation="horizontal"
        contain="window"
      />
    {/if}

    {#if constant.length > 0}
      <p class="text-muted-foreground text-[0.625rem]">
        {constant
          .map((group) => `${group.name} constant at ${format(numeric[group.id]?.median ?? 0)}`)
          .join(" · ")}
      </p>
    {/if}
  </div>
{:else if bars.length > 0}
  <div class="flex flex-col gap-1.5">
    <div class="text-muted-foreground flex items-center justify-between gap-2 text-[0.625rem]">
      {#if compare && drawn.length > 1}
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="size-2 shrink-0" style="background:{accent[drawn[0].id]}" aria-hidden="true"
          ></span>
          <span class="truncate">◀ {drawn[0].name}</span>
        </span>
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="truncate">{drawn.at(-1)?.name} ▶</span>
          <span
            class="size-2 shrink-0"
            style="background:{accent[drawn.at(-1)!.id]}"
            aria-hidden="true"
          ></span>
        </span>
      {:else if drawn.length > 0}
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="size-2 shrink-0" style="background:{accent[drawn[0].id]}" aria-hidden="true"
          ></span>
          <span class="truncate">{drawn[0].name}, share of cases</span>
        </span>
      {/if}
    </div>

    <div class="relative">
      {#if compare}
        <div
          class="bg-sidebar pointer-events-none absolute inset-y-0 z-10 w-0.5"
          style="left:calc(50% + {(PAD_LEFT - PAD_RIGHT) / 2 - 1}px)"
          aria-hidden="true"
        ></div>
      {/if}
      <Chart.Container
        config={{}}
        class="aspect-auto h-[calc(1.375rem*var(--rows))] w-full"
        style="--rows:{shown.length}"
      >
        <BarChart
          data={shown}
          orientation="horizontal"
          x="value"
          y="name"
          c="side"
          cDomain={drawn.map((group) => group.id)}
          cRange={drawn.map((group) => accent[group.id])}
          xDomain={domain}
          axis="y"
          grid={false}
          rule={false}
          legend={false}
          bandPadding={0.3}
          padding={{ left: PAD_LEFT, right: PAD_RIGHT }}
          props={{
            bars: { stroke: "none", radius: 2, rounded: "all" },
            highlight: { area: { fill: "none" } },
            yAxis: { format: truncate, tickLabelProps: { svgProps: { x: -10 } } }
          }}
          labels={{ placement: "outside", format: barLabel }}
        >
          <!-- The `tooltip` snippet, not `children`: children replace the chart's own layout. -->
          {#snippet tooltip()}
            <Tooltip.Root props={{ root: { class: "w-max" } }}>
              {#snippet children({ data })}
                <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
                  <p class="mb-1 text-[0.6875rem] font-semibold">{data.name}</p>
                  <dl class="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[0.625rem]">
                    {#each drawn as group (group.id)}
                      <dt class="text-muted-foreground truncate">{group.name}</dt>
                      <dd class="text-right">
                        {formatNumber(data.counts[group.id])} · {data.shares[group.id].toFixed(1)}%
                      </dd>
                    {/each}
                    {#if compare && drawn.length > 1}
                      <dt class="text-muted-foreground">gap</dt>
                      <dd class="text-right">{barLabel(data.gap)}</dd>
                    {/if}
                  </dl>
                </div>
              {/snippet}
            </Tooltip.Root>
          {/snippet}
        </BarChart>
      </Chart.Container>
    </div>

    {#if bars.length > TOP}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-[0.625rem]"
        onclick={() => (expanded = !expanded)}
      >
        {#if expanded}
          <ChevronUp class="size-3" aria-hidden="true" />
          Show top {TOP}
        {:else}
          <ChevronDown class="size-3" aria-hidden="true" />
          {bars.length - TOP} more {compare ? "categories" : "values"}
        {/if}
      </button>
    {/if}
  </div>
{:else}
  <p class="text-muted-foreground text-xs">No values at this node.</p>
{/if}
