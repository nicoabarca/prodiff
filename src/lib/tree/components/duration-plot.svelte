<script lang="ts">
  /**
   * The two duration encodings that are not bars: the cumulative curve drawn
   * here, and the box plot the shared component draws.
   *
   * The curve's axis is symlog, not log: a duration of zero is ordinary here and
   * `log(0)` does not exist. Symlog's `constant` is the ladder's first rung, not
   * its default of 1, which in milliseconds would spend half the axis under a
   * second. Ticks are the backend ladder's rungs inside the plotted span.
   */
  import { scaleSymlog } from "d3-scale";
  import { Axis, Chart, ChartClipPath, Highlight, Layer, Spline, Tooltip } from "layerchart";
  import BoxPlot from "$lib/analysis/components/box-plot.svelte";
  import type { BoxStats, DurationShape } from "$lib/distributions/invokers/types";
  import type { CurveRow } from "$lib/distributions/types";
  import { curveRows } from "$lib/distributions/utils/distributions";
  import { colorVar, formatDuration } from "$lib/format";

  let {
    shape,
    encoding,
    compare,
    groups
  }: {
    shape: DurationShape;
    encoding: "ecdf" | "box";
    compare: boolean;
    groups: { id: string; name: string; color: string }[];
  } = $props();

  /** The Groups drawn, in order. Without comparison only the first is plotted. */
  const drawn = $derived(compare ? groups : groups.slice(0, 1));

  const accent = $derived(
    Object.fromEntries(drawn.map((group) => [group.id, colorVar(group.color)]))
  );

  const ladders = $derived(
    Object.fromEntries(drawn.map((group) => [group.id, shape.ecdf[group.id] ?? []]))
  );

  const plotted = $derived(drawn.filter((group) => ladders[group.id].length > 0));

  const rows = $derived(curveRows(ladders));

  /** A curve needs two distinct durations: with one the scale has a zero-width domain. */
  const oneValue = $derived(rows.length < 2);

  /** The narrowest and widest values plotted, so all Groups are drawn to one scale. */
  const min = $derived(
    plotted.length === 0 ? 0 : Math.min(...plotted.map((group) => ladders[group.id][0] ?? 0))
  );
  const max = $derived(
    plotted.length === 0 ? 0 : Math.max(...plotted.map((group) => ladders[group.id].at(-1) ?? 0))
  );

  /** Where symlog stops being linear: the ladder's first rung. */
  const linearBelow = $derived(shape.logEdges.find((edge) => edge > 0) ?? max ?? 1);

  /**
   * Rungs strictly inside a span, at most one per label: every rung under half a
   * second formats to "0s", and a repeated label reads as a misplaced axis end.
   * Zero earns its own rung when the span straddles it, which is where the
   * overlapping activities sit. A narrow span can contain none, where the scale
   * ticks itself.
   */
  function rungs(low: number, high: number): number[] | undefined {
    const seen = new Set<string>();
    const candidates = low < 0 && high > 0 ? [0, ...shape.logEdges] : shape.logEdges;
    const inside = candidates.filter((edge) => {
      if (!(edge > low && edge < high)) return false;
      const label = formatDuration(edge);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
    return inside.length >= 2 ? inside : undefined;
  }

  const ticks = $derived(rungs(min, max));

  const boxes = $derived(
    drawn
      .map((group) => ({
        group: group.name,
        color: accent[group.id],
        stats: shape.boxStats[group.id] ?? null
      }))
      .filter((box) => box.stats !== null)
      .map(({ group, color, stats }) => ({ group, color, ...(stats as BoxStats) }))
  );

  const percent = (share: number) => `${Math.round(share * 100)}%`;

  /** The spread between the highest and lowest share on a row, when every Group has one. */
  function gap(row: CurveRow): number | null {
    if (drawn.length < 2) return null;
    const shares = drawn.map((group) => row.shares[group.id] ?? null);
    if (shares.some((share) => share === null)) return null;
    return Math.max(...(shares as number[])) - Math.min(...(shares as number[]));
  }
</script>

{#snippet noSpread(value: number)}
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
        y={(row: CurveRow) => row.shares[drawn[0]?.id] ?? null}
        xScale={scaleSymlog().constant(linearBelow)}
        xDomain={[min, max]}
        yDomain={[0, 1]}
        tooltipContext={{ mode: "bisect-x" }}
        padding={{ left: 40, bottom: 34, right: 12, top: 8 }}
      >
        <Layer>
          <Axis placement="left" grid rule ticks={[0, 0.25, 0.5, 0.75, 1]} format={percent} />
          <Axis placement="bottom" rule {ticks} format={formatDuration} />
          <!-- Nothing an SVG layer draws is clipped by default, so a path with a
               coordinate outside the plot is painted across the page. The marks are
               bounded to the plot. -->
          <ChartClipPath>
            <!-- Every curve off one set of rows, keyed on the union of the ladders'
                 durations: `bisect-x` needs a single sorted x to search. -->
            {#each plotted as group (group.id)}
              <Spline
                y={(row: CurveRow) => row.shares[group.id] ?? null}
                stroke={accent[group.id]}
                strokeWidth={2}
              />
            {/each}
            <Highlight lines points={{ fill: accent[drawn[0]?.id] }} />
          </ChartClipPath>
        </Layer>
        <Tooltip.Root contained="container" props={{ root: { class: "w-40" } }}>
          {#snippet children({ data: row })}
            <div class="bg-popover text-popover-foreground border-border border p-2 shadow-md">
              <p class="mb-1 text-[0.6875rem] font-semibold">
                {formatDuration(row.value)} or less
              </p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-[0.625rem]">
                {#each drawn as group (group.id)}
                  {@const share = row.shares[group.id] ?? null}
                  <dt class="text-muted-foreground truncate">{group.name}</dt>
                  <dd class="text-right">{share === null ? "—" : percent(share)}</dd>
                {/each}
                {#if gap(row) !== null}
                  <dt class="text-muted-foreground">gap</dt>
                  <dd class="text-right">{percent(gap(row) as number)}</dd>
                {/if}
              </dl>
            </div>
          {/snippet}
        </Tooltip.Root>
      </Chart>
    </div>
    <div class="flex flex-wrap gap-1.5 px-3 pb-2 text-[0.625rem]">
      {#each [["Median", 50], ["P90", 90]] as [label, at] (label)}
        <span class="bg-secondary px-2 py-1">
          {label}: {plotted
            .map((group) => `${group.name} ${formatDuration(ladders[group.id][at as number] ?? 0)}`)
            .join(" · ")}
        </span>
      {/each}
    </div>
  {/if}
{:else if boxes.length === 0}
  <p class="text-muted-foreground p-3 text-center text-xs">Nothing to plot here.</p>
{:else}
  <BoxPlot {boxes} ladder={shape.logEdges} constant={linearBelow} format={formatDuration} />
  <div class="flex flex-wrap gap-1.5 px-3 pb-2 text-[0.625rem]">
    {#each boxes as box (box.group)}
      <span class="bg-secondary px-2 py-1">
        {box.group} IQR: {formatDuration(box.q1)}–{formatDuration(box.q3)}
      </span>
    {/each}
  </div>
{/if}
