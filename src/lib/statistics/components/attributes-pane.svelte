<script lang="ts">
  import { formatDecimal } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { linearAxis } from "$lib/statistics/utils/axis";
  import { effectLabel, formatP, formatSigned, isGap } from "$lib/analysis/utils/change";
  import { valueShares } from "$lib/statistics/utils/figures";
  import BoxRows from "$lib/statistics/components/box-rows.svelte";
  import ColumnHead from "$lib/statistics/components/column-head.svelte";
  import PairBars from "$lib/statistics/components/pair-bars.svelte";

  let {
    groups,
    comparison,
    columnsHref
  }: { groups: Group[]; comparison: ResponseGroupComparison; columnsHref: string } = $props();

  /** An effect this big fills the bar. */
  const FULL_EFFECT = 0.5;

  const ids = $derived(groups.map((group) => group.id));
  const pair = $derived(groups.length === 2);
  const ranked = $derived(
    [...comparison.attributes].sort(
      (a, b) =>
        (b.test?.effectSize ?? -1) - (a.test?.effectSize ?? -1) || a.name.localeCompare(b.name)
    )
  );

  let chosen = $state<string | null>(null);
  const selected = $derived(ranked.find((row) => row.name === chosen) ?? ranked[0] ?? null);
  const numeric = $derived(
    selected ? Object.values(selected.summaries).some((s) => s.type === "numerical") : false
  );
  const shares = $derived(selected && !numeric ? valueShares(selected.summaries, ids) : []);
  const shareMax = $derived(
    Math.max(0, ...shares.flatMap((row) => Object.values(row.values).map((v) => v ?? 0)))
  );
  const boxes = $derived(
    Object.fromEntries(
      groups.map((group) => {
        const summary = selected?.summaries[group.id];
        return [group.id, summary?.type === "numerical" ? summary : null];
      })
    )
  );
  const axis = $derived.by(() => {
    const drawn = Object.values(boxes).filter((box) => box !== null);
    return linearAxis(
      Math.min(...drawn.map((box) => box.whiskerLow)),
      Math.max(...drawn.map((box) => box.whiskerHigh)),
      (value) => formatDecimal(value, 0)
    );
  });
  const formatValue = (value: number) =>
    Number.isInteger(value) ? String(value) : formatDecimal(value);
  import GroupName from "$lib/statistics/components/group-name.svelte";
</script>

<div class="bg-card flex flex-col">
  <div class="flex flex-wrap items-center gap-2.5 border-b px-4.5 py-2.5">
    <span class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">
      Columns, ranked by difference
    </span>
    <span class="text-muted-foreground ml-auto text-[0.6875rem]">
      {comparison.attributes.length} visible attribute columns ·
      <a class="text-primary hover:text-foreground" href={columnsHref}>set in Event log</a>
    </span>
  </div>

  {#if ranked.length === 0}
    <p class="text-muted-foreground px-4.5 py-6 text-xs">
      No attribute column is visible. Show one in Event log to compare it here.
    </p>
  {:else}
    <ColumnHead>
      <span class="min-w-0 flex-1">Column</span>
      <span class="w-36 shrink-0">Type</span>
      <span class="w-52 shrink-0">Effect size</span>
      <span class="w-44 shrink-0">Test</span>
      <span class="w-28 shrink-0 text-right">Result</span>
    </ColumnHead>
    {#each ranked as row (row.name)}
      {@const test = row.test}
      {@const active = selected?.name === row.name}
      <button
        type="button"
        class="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 border-t border-l-2 px-4.5 py-2.25 text-left {active
          ? 'bg-muted/60 border-l-primary'
          : 'border-l-transparent'}"
        onclick={() => (chosen = row.name)}
      >
        <span class="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
          <AttributeName name={row.name} />
        </span>
        <span class="text-muted-foreground w-36 shrink-0 truncate text-[0.6875rem]">
          {Object.values(row.summaries).some((s) => s.type === "numerical")
            ? "Numeric"
            : "Categorical"} · {row.scope}
        </span>
        <span class="flex w-52 shrink-0 items-center gap-2">
          {#if test}
            <span class="bg-muted relative h-1.5 w-20 shrink-0">
              <span
                class="absolute inset-y-0 left-0 {test.significant
                  ? 'bg-destructive'
                  : 'bg-muted-foreground/50'}"
                style="width:{Math.min(test.effectSize / FULL_EFFECT, 1) * 100}%"
              ></span>
            </span>
            <span class="w-9 shrink-0 text-right font-mono text-[0.6875rem]">
              {test.effectSize.toFixed(2)}
            </span>
            <span class="text-muted-foreground truncate text-[0.6875rem]">
              {effectLabel(test.effectSize)}
            </span>
          {/if}
        </span>
        <span class="text-muted-foreground w-44 shrink-0 truncate font-mono text-[0.6875rem]">
          {#if test}
            {test.test === "chi2" ? "χ² · V" : "Mann–Whitney · r"} · p {formatP(test.pValue)}
          {:else}
            {pair ? "Too few values" : "One group"}
          {/if}
        </span>
        <span
          class="w-28 shrink-0 text-right text-[0.6875rem] font-semibold {test?.significant
            ? 'text-destructive'
            : 'text-muted-foreground'}"
        >
          {test ? (test.significant ? "Significant" : "Not significant") : "Not tested"}
        </span>
      </button>
    {/each}

    {#if selected}
      <div class="flex flex-wrap items-baseline gap-2.5 border-t px-4.5 pt-4 pb-2">
        <span class="font-mono text-xs font-bold"><AttributeName name={selected.name} /></span>
        <span class="text-muted-foreground text-xs">
          {numeric
            ? "Distribution per group"
            : selected.scope === "case"
              ? "Share of cases per value"
              : "Share of events per value"}
        </span>
      </div>
      {#if numeric}
        <div class="px-4.5 pt-3.5 pb-4.5">
          <BoxRows {groups} {boxes} {axis} format={formatValue} />
        </div>
      {:else}
        <ColumnHead class="bg-card!">
          <span class="w-36 shrink-0">Value</span>
          <span class="min-w-0 flex-1">Share</span>
          {#each groups as group (group.id)}
            <span class="flex w-20 shrink-0 justify-end"><GroupName {group} /></span>
          {/each}
          {#if pair}
            <span class="w-16 shrink-0 text-right">Δ pp</span>
          {/if}
        </ColumnHead>
        {#each shares as row (row.name)}
          {@const gap = isGap(row.delta)}
          <div
            class="flex items-center gap-3 border-t px-4.5 py-1.75 {gap ? 'bg-destructive/5' : ''}"
          >
            <span class="w-36 shrink-0 truncate font-mono text-xs" title={row.name}>{row.name}</span
            >
            <span class="min-w-0 flex-1"
              ><PairBars {groups} values={row.values} max={shareMax} /></span
            >
            {#each groups as group, index (group.id)}
              <span
                class="w-20 shrink-0 text-right font-mono text-xs {index === 0 && pair
                  ? 'text-muted-foreground'
                  : 'font-semibold'}"
              >
                {(row.values[group.id] ?? 0).toFixed(1)}%
              </span>
            {/each}
            {#if pair}
              <span
                class="w-16 shrink-0 text-right font-mono text-xs {gap
                  ? 'text-destructive'
                  : 'text-muted-foreground'}"
              >
                {formatSigned(row.delta)}
              </span>
            {/if}
          </div>
        {/each}
      {/if}
    {/if}
  {/if}
</div>
