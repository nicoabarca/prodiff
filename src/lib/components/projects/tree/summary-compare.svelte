<script lang="ts">
  /**
   * One attribute's Group A vs Group B comparison, drawn as the difference
   * rather than as two distributions side by side.
   *
   * Categorical attributes chart the *share gap* — how many percentage points
   * more common a value is in one Group than the other — diverging from a zero
   * rule, ranked by that gap. Charting the shares themselves is what made this
   * unreadable before: forty resources each hold ~2% of the cases, so every bar
   * came out a two-pixel sliver and the ranking surfaced the biggest values
   * instead of the most different ones. Scaling to the largest gap makes a
   * sliver impossible by construction.
   *
   * Numeric attributes lead with the median difference in words, then draw two
   * Tukey box plots on a shared axis — the summary the backend ships *is* a box
   * plot, whiskers and outlier counts included, so nothing is recomputed here.
   * The same five numbers and the same whisker rule as the Distributions view,
   * so an attribute read in both places tells one story.
   */
  import { Axis, BarChart, BoxPlot, Chart as ChartRoot, Svg, Tooltip } from "layerchart";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { formatDecimal, formatDuration, formatNumber } from "$lib/format";
  import { groupSlices } from "$lib/state/tree.svelte";
  import type { Summary } from "$lib/tree";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";

  let {
    groupA,
    groupB,
    compare = true,
    duration = false
  }: {
    groupA: Summary | null;
    groupB: Summary | null;
    /** False in one-Group mode, where there is no difference to draw. */
    compare?: boolean;
    duration?: boolean;
  } = $props();

  // The Groups keep the colours the tree nodes give them, and the names the
  // user gave their slices — "Group A"/"Group B" only if a slice has gone.
  const COLOR_A = "var(--slice-1)";
  const COLOR_B = "var(--slice-2)";
  const groups = $derived(groupSlices());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  /** How many categories fit before the rest go behind the disclosure. */
  const TOP = 6;

  // The label gutter and the value gutter are fixed, so the zero rule sits at a
  // position the layout can compute: halfway between them.
  const PAD_LEFT = 84;
  const PAD_RIGHT = 60;

  const format = (value: number) =>
    duration ? formatDuration(value) : formatDecimal(value, Math.abs(value) < 10 ? 2 : 0);

  // ---------------------------------------------------------------- numeric

  const numericA = $derived(groupA?.type === "numerical" ? groupA : null);
  const numericB = $derived(groupB?.type === "numerical" ? groupB : null);
  const isNumeric = $derived(numericA !== null || numericB !== null);

  /**
   * The axis spans the two Groups' whiskers.
   *
   * Not the full range: one case that took ten times the rest would squeeze
   * both boxes into a few pixels. And no longer the quartiles either — the box
   * *is* the quartiles, so an axis derived from them gave every attribute a box
   * filling the same fixed fraction of the width, whatever the data. A box plot
   * whose shape is decided by its own axis is a bar with extra steps.
   *
   * Tukey bounds the whiskers at 1.5·IQR either side, so the box can never fall
   * below a quarter of the axis nor grow to fill it. The outliers past them are
   * counted underneath instead of stretching the scale to reach one of them.
   */
  const span = $derived.by(() => {
    const present = [numericA, numericB].filter((s) => s !== null);
    if (present.length === 0) return null;
    const lowest = Math.min(...present.map((s) => s.min));
    const highest = Math.max(...present.map((s) => s.max));
    const lo = Math.min(...present.map((s) => s.whiskerLow));
    const hi = Math.max(...present.map((s) => s.whiskerHigh));
    // Every case identical, in both Groups: a scale with nowhere to put a mark.
    if (!(hi > lo)) {
      const pad = Math.max(Math.abs(hi) * 0.1, 1);
      return { lo: lo - pad, hi: hi + pad, lowest, highest };
    }
    // A sliver of headroom so a whisker cap lands inside the plot rather than
    // on its edge, where it reads as clipped.
    const pad = (hi - lo) * 0.04;
    return { lo: lo - pad, hi: hi + pad, lowest, highest };
  });

  const boxes = $derived(
    [
      numericA && { group: nameA, color: COLOR_A, ...numericA },
      numericB && { group: nameB, color: COLOR_B, ...numericB }
    ].filter((row) => row !== null)
  );

  /** Groups whose cases all share one value — drawn as a dot, not a box. */
  const constant = $derived(boxes.filter((row) => row.min === row.max));

  /**
   * Nothing varies anywhere. There is no spread to plot and no axis to plot it
   * on — the span collapses to a padding either side of the one value, so every
   * tick formats to that same value and the axis reads `0s 0s 0s 0s 0s`. The
   * sentence below carries it instead.
   */
  const allConstant = $derived(boxes.length > 0 && constant.length === boxes.length);

  /** Groups with values past a whisker, said in words under the plot. */
  const beyond = $derived(
    boxes
      .filter((row) => row.outliersHigh + row.outliersLow > 0)
      .map((row) => {
        const parts = [];
        if (row.outliersHigh > 0) {
          parts.push(`${formatNumber(row.outliersHigh)} over ${format(row.whiskerHigh)}`);
        }
        if (row.outliersLow > 0) {
          parts.push(`${formatNumber(row.outliersLow)} under ${format(row.whiskerLow)}`);
        }
        return `${row.group}: ${parts.join(", ")}`;
      })
  );

  /** The headline the numeric block leads with, in the user's own group names. */
  const delta = $derived.by(() => {
    if (!compare || !numericA || !numericB) return null;
    const difference = numericB.median - numericA.median;
    if (difference === 0) return { same: true } as const;
    const percent = numericA.median === 0 ? null : (difference / Math.abs(numericA.median)) * 100;
    return {
      same: false,
      leader: difference > 0 ? nameB : nameA,
      word: duration ? "longer" : "higher",
      amount: format(Math.abs(difference)),
      percent
    } as const;
  });

  // ------------------------------------------------------------ categorical

  const categories = $derived.by(() => {
    const counts = [groupA, groupB].map((s) =>
      s?.type === "categorical" ? s.counts : ({} as Record<string, number>)
    );
    const totals = counts.map((c) => Object.values(c).reduce((sum, n) => sum + n, 0) || 1);
    const names = [...new Set(counts.flatMap((c) => Object.keys(c)))];
    return names.map((name) => {
      const a = counts[0][name] ?? 0;
      const b = counts[1][name] ?? 0;
      const shareA = (a / totals[0]) * 100;
      const shareB = (b / totals[1]) * 100;
      return { name, a, b, shareA, shareB, gap: shareB - shareA };
    });
  });

  /**
   * What the bars encode: the gap when there are two Groups to compare, plain
   * share when there is only one and a gap would mean nothing. Colour follows
   * the Group the value leans towards, so it agrees with the side it sits on.
   */
  const bars = $derived(
    compare
      ? categories
          .map((c) => ({ ...c, value: c.gap, side: c.gap < 0 ? "a" : "b" }))
          .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
      : categories
          .map((c) => ({ ...c, value: c.shareA, side: "a" }))
          .sort((x, y) => y.value - x.value)
  );

  let expanded = $state(false);
  const shown = $derived(expanded ? bars : bars.slice(0, TOP));

  /**
   * Scaled to the largest gap across *every* category, not just the shown ones,
   * so expanding the list never rescales the bars already read. The headroom
   * keeps the longest bar's label inside the plot: without it the label runs
   * back into the category-name gutter and the two collide.
   */
  const domain = $derived.by((): [number, number] => {
    const largest = Math.max(...bars.map((b) => Math.abs(b.value)), 0.1);
    return compare ? [-largest * 1.55, largest * 1.55] : [0, largest * 1.3];
  });

  const barLabel = (value: number) => {
    if (!compare) return `${value.toFixed(1)}%`;
    // Rounding to one decimal turns a −0.04 gap into "−0.0", which reads as a
    // direction the number does not actually have.
    const sign = Math.abs(value) < 0.05 ? "" : value > 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(1)} pp`;
  };

  const truncate = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);
</script>

{#if isNumeric && span}
  <div class="flex flex-col gap-2">
    {#if delta}
      <p class="text-[0.6875rem]">
        {#if delta.same}
          Same median in both groups.
        {:else}
          <span class="font-semibold">{delta.leader}</span>
          {delta.word} by {delta.amount} at the median
          {#if delta.percent !== null}
            <!-- Magnitude only: the sentence already names which group leads, so
                 a sign here would contradict it half the time. -->
            <span class="text-muted-foreground">· {Math.abs(delta.percent).toFixed(0)}%</span>
          {/if}
        {/if}
      </p>
    {/if}

    {#if !allConstant}
      <div class="flex items-stretch">
        <Chart.Container
          config={{}}
          class="aspect-auto h-[calc(1.75rem*var(--rows)+1.25rem)] w-full"
          style="--rows:{boxes.length}"
        >
          <ChartRoot
            data={boxes}
            x="median"
            y="group"
            xDomain={[span.lo, span.hi]}
            valueAxis="x"
            bandPadding={0.35}
            padding={{ left: 76, right: 8, bottom: 20 }}
            tooltipContext={{ mode: "manual" }}
          >
            {#snippet children({ context })}
              <Svg>
                <Axis
                  placement="left"
                  rule={false}
                  grid={false}
                  format={truncate}
                  tickLabelProps={{ svgProps: { x: -8 } }}
                />
                <Axis placement="bottom" rule={false} grid={false} ticks={3} {format} />
                {#each boxes as row (row.group)}
                  {#if row.min === row.max}
                    <!-- Zero spread: a box with no width reads as a truncated
                       one, so draw the single value the cases actually share. -->
                    <circle
                      cx={context.xScale(row.median)}
                      cy={context.yScale(row.group) + (context.yScale.bandwidth?.() ?? 0) / 2}
                      r="4"
                      fill={row.color}
                      stroke={row.color}
                      stroke-width="1.5"
                      fill-opacity="0.35"
                    />
                  {:else}
                    <!-- `min`/`max` are the whisker ends by this component's own
                       definition — the extremes excluding outliers — so the
                       Tukey bounds go there and nothing needs clamping. -->
                    <BoxPlot
                      data={row}
                      min="whiskerLow"
                      q1="q1"
                      median="median"
                      q3="q3"
                      max="whiskerHigh"
                      fill={row.color}
                      fillOpacity={0.35}
                      stroke={row.color}
                      strokeWidth={1.5}
                      radius={2}
                      capWidth={0.7}
                      tooltip
                    />
                    <!-- Drawn over the box in the surface colour. The median line
                       the mark draws itself is the box's own stroke colour on
                       the box's own fill, which is invisible — and the median
                       is the one thing the reader came for. -->
                    <line
                      x1={context.xScale(row.median)}
                      x2={context.xScale(row.median)}
                      y1={context.yScale(row.group) + (context.yScale.bandwidth?.() ?? 0) * 0.15}
                      y2={context.yScale(row.group) + (context.yScale.bandwidth?.() ?? 0) * 0.85}
                      class="stroke-sidebar"
                      stroke-width="2"
                      pointer-events="none"
                    />
                  {/if}
                {/each}
              </Svg>

              <!-- Wide and short on purpose, clamped to the window rather than
                 the plot: the plot is only a few rem tall and sits inside the
                 panel's scroll viewport, so a tall tooltip gets pushed up out
                 of the chart and clipped at the viewport's top edge. -->
              <!-- `w-max`: the root is absolutely positioned, so without it the
                 box shrinks to whatever space is left at the container's right
                 edge and the columns collapse into each other. -->
              <Tooltip.Root contained="window" props={{ root: { class: "w-max" } }}>
                {#snippet children({ data })}
                  <div
                    class="bg-popover text-popover-foreground border-border border px-2 py-1.5 shadow-md"
                  >
                    <p class="mb-1 text-[0.6875rem] font-semibold">{data.group}</p>
                    <dl class="grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[0.625rem]">
                      <!-- The whiskers are listed because they are what is drawn:
                         `min`/`max` are the true extremes and the box
                         deliberately stops short of them. -->
                      {#each [["min", format(data.min)], ["q1", format(data.q1)], ["median", format(data.median)], ["q3", format(data.q3)], ["max", format(data.max)], ["n", formatNumber(data.n)], ["whisker lo", format(data.whiskerLow)], ["whisker hi", format(data.whiskerHigh)]] as [label, value] (label)}
                        <div>
                          <dt class="text-muted-foreground">{label}</dt>
                          <dd class="whitespace-nowrap">{value}</dd>
                        </div>
                      {/each}
                    </dl>
                  </div>
                {/snippet}
              </Tooltip.Root>
            {/snippet}
          </ChartRoot>
        </Chart.Container>

        <!-- Medians sit outside the plot so the axis keeps its full width. The
           rows are fixed-height and the band scale centres in the same boxes,
           so the two columns line up without measuring anything. -->
        <div class="flex shrink-0 flex-col pb-5">
          {#each boxes as row (row.group)}
            <span
              class="text-muted-foreground flex h-7 w-20 items-center justify-end font-mono text-[0.625rem]"
            >
              {format(row.median)}
            </span>
          {/each}
        </div>
      </div>
    {/if}

    {#if constant.length > 0}
      <p class="text-muted-foreground text-[0.625rem]">
        {constant.map((row) => `${row.group} constant at ${format(row.median)}`).join(" · ")}
      </p>
    {/if}

    {#if beyond.length > 0}
      <p class="text-muted-foreground text-[0.625rem]">
        {beyond.join(" · ")} · full range {format(span.lowest)} – {format(span.highest)}.
      </p>
    {/if}
  </div>
{:else if bars.length > 0}
  <div class="flex flex-col gap-1.5">
    <div class="text-muted-foreground flex items-center justify-between gap-2 text-[0.625rem]">
      {#if compare}
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="size-2 shrink-0" style="background:{COLOR_A}" aria-hidden="true"></span>
          <span class="truncate">◀ {nameA}</span>
        </span>
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="truncate">{nameB} ▶</span>
          <span class="size-2 shrink-0" style="background:{COLOR_B}" aria-hidden="true"></span>
        </span>
      {:else}
        <span class="inline-flex min-w-0 items-center gap-1">
          <span class="size-2 shrink-0" style="background:{COLOR_A}" aria-hidden="true"></span>
          <span class="truncate">{nameA} — share of cases</span>
        </span>
      {/if}
    </div>

    <div class="relative">
      {#if compare}
        <!-- Above the bars, in the surface colour: every bar starts at zero, so
             behind them the rule would never be visible. As a gap it reads as
             the baseline the two sides are measured from. -->
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
          cDomain={["a", "b"]}
          cRange={[COLOR_A, COLOR_B]}
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
          <!-- The `tooltip` snippet, not `children`: children would replace the
               chart's own layout wholesale rather than add to it. -->
          {#snippet tooltip()}
            <Tooltip.Root props={{ root: { class: "w-max" } }}>
              {#snippet children({ data })}
                <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
                  <p class="mb-1 text-[0.6875rem] font-semibold">{data.name}</p>
                  <dl class="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[0.625rem]">
                    <dt class="text-muted-foreground truncate">{nameA}</dt>
                    <dd class="text-right">{formatNumber(data.a)} · {data.shareA.toFixed(1)}%</dd>
                    {#if compare}
                      <dt class="text-muted-foreground truncate">{nameB}</dt>
                      <dd class="text-right">{formatNumber(data.b)} · {data.shareB.toFixed(1)}%</dd>
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
