<script lang="ts">
  /**
   * The two duration encodings that are not bars: the cumulative curve and the
   * box plot.
   *
   * Both axes are symlog, not log: a duration of zero is ordinary here and
   * `log(0)` does not exist. Symlog's `constant` is set to the ladder's first
   * rung rather than its default of 1, which in milliseconds would spend half
   * the axis on the range under a second. Ticks come from the backend's ladder.
   */
  import { scaleBand, scaleSymlog } from "d3-scale";
  import {
    Axis,
    BoxPlot,
    Chart,
    ChartClipPath,
    Highlight,
    Layer,
    Spline,
    Tooltip
  } from "layerchart";
  import type { BoxStats, DurationShape } from "$lib/distributions/invokers/types";
  import { curveRows, outlierNote } from "$lib/distributions/utils/distributions";
  import { colorVar, formatDuration, formatNumber } from "$lib/format";
  import { comparedGroups } from "$lib/tree/state/tree.svelte";

  let {
    shape,
    encoding,
    compare,
    nameA,
    nameB
  }: {
    shape: DurationShape;
    encoding: "ecdf" | "box";
    compare: boolean;
    nameA: string;
    nameB: string;
  } = $props();

  // The Groups keep the colours they carry in the tree and the differences
  // panel, so a shift that is "the blue one" stays blue across all three.
  const groups = $derived(comparedGroups());
  const COLOR_A = $derived(colorVar(groups[0]?.color ?? "group-1"));
  const COLOR_B = $derived(colorVar(groups[1]?.color ?? "group-2"));

  const rows = $derived(curveRows(shape.ecdfA, compare ? shape.ecdfB : []));

  /**
   * A curve needs two distinct durations. With one the scale has a zero-width
   * domain and d3 draws a stroke at coordinates belonging to no plot.
   */
  const oneValue = $derived(rows.length < 2);

  /** The widest value either Group reaches, so both are drawn to one scale. */
  const max = $derived(
    Math.max(shape.ecdfA.at(-1) ?? 0, shape.ecdfB.at(-1) ?? 0, shape.logEdges.at(-1) ?? 0)
  );

  /**
   * Where symlog stops being linear. The ladder's first rung — below it the
   * ladder draws no boundary, so a log stretch has nothing to separate.
   */
  const linearBelow = $derived(shape.logEdges.find((edge) => edge > 0) ?? max ?? 1);

  /** Interior rungs of the ladder — 0 and the data's own end are the axis. */
  const ticks = $derived(shape.logEdges.filter((edge) => edge > 0 && edge < max));

  const boxes = $derived(
    (
      [
        [nameA, shape.boxA],
        [nameB, shape.boxB]
      ] as [string, BoxStats | null][]
    )
      .filter(([, stats], index) => stats !== null && (index === 0 || compare))
      .map(([group, stats]) => ({ group, ...(stats as BoxStats) }))
  );

  const colorOf = (group: string) => (group === nameA ? COLOR_A : COLOR_B);

  /**
   * The box plot's axis spans the whiskers and nothing else — not the data's
   * range, whose outliers are counted rather than drawn, and not anchored at
   * zero, which would spend most of the axis reaching the interesting band.
   */
  const boxLow = $derived(Math.min(...boxes.map((box) => box.whiskerLow)));
  const boxHigh = $derived(Math.max(...boxes.map((box) => box.whiskerHigh)));

  /**
   * Whiskers collapsed onto a single value: the quartiles are all the same
   * number, so there is no box to draw.
   */
  const flat = $derived(boxes.length === 0 || !(boxHigh > boxLow));

  /**
   * Rungs strictly inside the span. A narrow span can contain none, in which
   * case the scale picks its own.
   */
  const boxTicks = $derived.by(() => {
    const inside = shape.logEdges.filter((edge) => edge > boxLow && edge < boxHigh);
    return inside.length >= 2 ? inside : undefined;
  });

  const outliers = $derived(
    boxes.map((box) => outlierNote(box.group, box, formatDuration)).filter((note) => note !== null)
  );

  const percent = (share: number) => `${Math.round(share * 100)}%`;
</script>

{#snippet noSpread(value: number)}
  <!-- Both encodings say it the same way, from one place: a constant attribute
       is the same finding whichever plot was asked for. -->
  <p class="flex flex-1 items-center justify-center p-3 text-center text-xs">
    All values are <span class="ml-1 font-semibold">{formatDuration(value)}</span>.
  </p>
{/snippet}

{#if encoding === "ecdf"}
  {#if rows.length === 0}
    <p class="text-muted-foreground p-3 text-center text-xs">Nothing to plot here.</p>
  {:else if oneValue}
    {@render noSpread(rows[0].value)}
  {:else}
    <div class="h-64 px-3 py-2">
      <Chart
        data={rows}
        x="value"
        y="a"
        xScale={scaleSymlog().constant(linearBelow)}
        xDomain={[0, max]}
        yDomain={[0, 1]}
        tooltipContext={{ mode: "bisect-x" }}
        padding={{ left: 40, bottom: 34, right: 12, top: 8 }}
      >
        <Layer>
          <Axis placement="left" grid rule ticks={[0, 0.25, 0.5, 0.75, 1]} format={percent} />
          <Axis placement="bottom" rule {ticks} format={formatDuration} />
          <!-- Nothing an SVG layer draws is clipped by default, so a path with a
               coordinate outside the plot is painted across the page — over the
               neighbouring cards and out of the window. The marks are bounded to
               the plot so a bad number stays a bad number instead of vandalising
               the grid. -->
          <ChartClipPath>
            <!-- Both curves off one set of rows, keyed on the union of the two
                 ladders' durations. `bisect-x` needs a single sorted x to
                 search, and the ECDF is a step function anyway, so sampling it
                 at every point either Group turns on is exact rather than a
                 compromise. -->
            <Spline y="a" stroke={COLOR_A} strokeWidth={2} />
            {#if compare && shape.ecdfB.length > 0}
              <Spline y="b" stroke={COLOR_B} strokeWidth={2} />
            {/if}
            <Highlight lines points={{ fill: COLOR_A }} />
          </ChartClipPath>
        </Layer>
        <!-- The reading the curve is for: at this duration, how far along is
             each Group. Hovering anywhere snaps to the nearest column. -->
        <Tooltip.Root contained="container" props={{ root: { class: "w-40" } }}>
          {#snippet children({ data: row })}
            <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
              <p class="mb-1 text-[0.6875rem] font-semibold">
                {formatDuration(row.value)} or less
              </p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-[0.625rem]">
                <dt class="text-muted-foreground truncate">{nameA}</dt>
                <dd class="text-right">{row.a === null ? "—" : percent(row.a)}</dd>
                {#if compare}
                  <dt class="text-muted-foreground truncate">{nameB}</dt>
                  <dd class="text-right">{row.b === null ? "—" : percent(row.b)}</dd>
                  {#if row.a !== null && row.b !== null}
                    <dt class="text-muted-foreground">gap</dt>
                    <dd class="text-right">{percent(Math.abs(row.a - row.b))}</dd>
                  {/if}
                {/if}
              </dl>
            </div>
          {/snippet}
        </Tooltip.Root>
      </Chart>
    </div>
    <!-- The two percentiles the curve is usually read at, said in words: the
         middle of the distribution and the tail that actually hurts. -->
    <div class="flex flex-wrap gap-1.5 px-3 pb-2 text-[0.625rem]">
      {#each [["Median", 50], ["P90", 90]] as [label, at] (label)}
        <span class="bg-secondary px-2 py-1">
          {label}: {nameA}
          {formatDuration(shape.ecdfA[at as number] ?? 0)}{#if compare && shape.ecdfB.length > 0}
            · {nameB} {formatDuration(shape.ecdfB[at as number] ?? 0)}{/if}
        </span>
      {/each}
    </div>
  {/if}
{:else if boxes.length === 0}
  <p class="text-muted-foreground p-3 text-center text-xs">Nothing to plot here.</p>
{:else}
  {#if flat}
    <!-- Whiskers and quartiles all on one value. Since the percentile fallback
         in `tukey`, that only happens when the sample really is constant — a box
         of zero height is a line that reads as a broken plot, and the value is
         the finding. -->
    {@render noSpread(boxes[0].median)}
  {:else}
    <div class="h-64 px-3 py-2">
      <Chart
        data={boxes}
        x="group"
        xScale={scaleBand().padding(0.35)}
        y="median"
        yScale={scaleSymlog().constant(linearBelow)}
        yDomain={[boxLow, boxHigh]}
        yNice
        tooltipContext={{ mode: "band" }}
        padding={{ left: 52, bottom: 24, right: 12, top: 8 }}
      >
        <Layer>
          <Axis placement="left" grid rule ticks={boxTicks} format={formatDuration} />
          <Axis placement="bottom" rule />
          <!-- Bounded for the same reason as the curve: an unclipped SVG layer
               paints a stray coordinate across the whole page. -->
          <ChartClipPath>
            {#each boxes as box (box.group)}
              <!-- `min`/`max` are the whisker ends by this component's own
               definition — the extremes excluding outliers — which is exactly
               what the backend computed. The outliers themselves are counts,
               not points, so they are stated below rather than drawn. -->
              <BoxPlot
                data={box}
                min="whiskerLow"
                q1="q1"
                median="median"
                q3="q3"
                max="whiskerHigh"
                fill={colorOf(box.group)}
                fillOpacity={0.18}
                stroke={colorOf(box.group)}
                strokeWidth={1.5}
              />
            {/each}
            <Highlight area />
          </ChartClipPath>
        </Layer>
        <!-- The numbers the box encodes, said out loud: read off a drawing they
             are estimates, and the whole reason to hover is to stop estimating.
             `Min`/`Max` are the observed extremes, which the whiskers
             deliberately stop short of.

             Kept small and `contained` on purpose. The grid this card sits in
             scrolls, so anything the tooltip pushes outside the card is clipped
             by that scroll box rather than drawn over it — a tooltip that fits
             the plot is the only one that can't be cut. The whisker rows are
             gone for the same reason: the caps are already on screen. -->
        <Tooltip.Root contained="container" props={{ root: { class: "w-40" } }}>
          {#snippet children({ data: box })}
            <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
              <p class="mb-1 text-[0.6875rem] font-semibold">{box.group}</p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-[0.625rem]">
                {#each [["Max", box.max], ["Q3", box.q3], ["Median", box.median], ["Q1", box.q1], ["Min", box.min], ["IQR", box.q3 - box.q1]] as [label, value] (label)}
                  <dt class="text-muted-foreground">{label}</dt>
                  <dd class="text-right">{formatDuration(value as number)}</dd>
                {/each}
              </dl>
              {#if box.outliersHigh > 0}
                <p class="text-muted-foreground mt-1 text-[0.625rem]">
                  {formatNumber(box.outliersHigh)} took longer than
                  {formatDuration(box.whiskerHigh)}, past the line and not drawn.
                </p>
              {/if}
            </div>
          {/snippet}
        </Tooltip.Root>
      </Chart>
    </div>
  {/if}
  <!-- Shown whether or not the boxes drew: when the whiskers collapse these
       chips are the only place the numbers appear. -->
  <div class="flex flex-wrap gap-1.5 px-3 pb-2 text-[0.625rem]">
    {#each boxes as box (box.group)}
      <span class="bg-secondary px-2 py-1">
        {box.group} IQR: {formatDuration(box.q1)}–{formatDuration(box.q3)}
      </span>
    {/each}
    {#each outliers as note (note)}
      <span class="text-muted-foreground px-2 py-1">{note}</span>
    {/each}
  </div>
{/if}
