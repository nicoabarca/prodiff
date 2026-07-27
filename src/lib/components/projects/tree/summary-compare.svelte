<script lang="ts">
  /**
   * One attribute's Group A vs Group B comparison. Numeric attributes draw as
   * two box plots on a shared axis — the five-number summary the backend ships
   * *is* a box plot, so nothing needs fetching or recomputing here. Categorical
   * ones draw as paired bars over the shipped counts.
   */
  import { formatDecimal, formatDuration, formatNumber } from "$lib/format";
  import type { Summary } from "$lib/tree";

  let {
    groupA,
    groupB,
    duration = false
  }: { groupA: Summary | null; groupB: Summary | null; duration?: boolean } = $props();

  const format = (value: number) =>
    duration ? formatDuration(value) : formatDecimal(value, value < 10 ? 2 : 0);

  const numeric = $derived(
    [groupA, groupB].filter((s): s is Extract<Summary, { type: "numerical" }> => {
      return s?.type === "numerical";
    })
  );
  const scale = $derived({
    min: Math.min(...numeric.map((s) => s.min)),
    max: Math.max(...numeric.map((s) => s.max))
  });
  /** Position along the shared axis, as a percentage. */
  const at = (value: number) => {
    const span = scale.max - scale.min;
    return span === 0 ? 0 : ((value - scale.min) / span) * 100;
  };

  const categories = $derived.by(() => {
    const counts = [groupA, groupB].map((s) =>
      s?.type === "categorical" ? s.counts : ({} as Record<string, number>)
    );
    const names = [...new Set(counts.flatMap((c) => Object.keys(c)))];
    const totals = counts.map((c) => Object.values(c).reduce((sum, n) => sum + n, 0) || 1);
    return names
      .map((name) => ({
        name,
        a: counts[0][name] ?? 0,
        b: counts[1][name] ?? 0,
        shareA: ((counts[0][name] ?? 0) / totals[0]) * 100,
        shareB: ((counts[1][name] ?? 0) / totals[1]) * 100
      }))
      .sort((x, y) => y.a + y.b - (x.a + x.b));
  });
</script>

{#if groupA?.type === "numerical" || groupB?.type === "numerical"}
  <div class="flex flex-col gap-2">
    {#each [{ summary: groupA, token: "--slice-1", name: "A" }, { summary: groupB, token: "--slice-2", name: "B" }] as row (row.name)}
      {#if row.summary?.type === "numerical"}
        {@const s = row.summary}
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground w-3 font-mono text-[0.625rem]">{row.name}</span>
          <div class="relative h-6 flex-1">
            <!-- Whiskers span min–max; the box is q1–q3 with the median inside. -->
            <div
              class="absolute top-1/2 h-px"
              style="left:{at(s.min)}%;width:{at(s.max) - at(s.min)}%;background:var({row.token})"
            ></div>
            <div
              class="absolute top-1/2 h-4 -translate-y-1/2 opacity-40"
              style="left:{at(s.q1)}%;width:{Math.max(at(s.q3) - at(s.q1), 0.5)}%;background:var({row.token})"
            ></div>
            <div
              class="absolute top-1/2 h-4 w-0.5 -translate-y-1/2"
              style="left:{at(s.median)}%;background:var({row.token})"
            ></div>
          </div>
          <span class="text-muted-foreground w-28 shrink-0 text-right font-mono text-[0.625rem]">
            {format(s.median)} · n={formatNumber(s.n)}
          </span>
        </div>
      {/if}
    {/each}
    {#if numeric.length > 0}
      <div class="text-muted-foreground flex justify-between font-mono text-[0.625rem]">
        <span>{format(scale.min)}</span>
        <span>{format(scale.max)}</span>
      </div>
    {/if}
  </div>
{:else if categories.length > 0}
  <div class="flex flex-col gap-1.5">
    {#each categories as category (category.name)}
      <div class="flex items-center gap-2">
        <span class="w-24 shrink-0 truncate text-[0.6875rem]">{category.name}</span>
        <div class="flex flex-1 flex-col gap-0.5">
          <div class="h-1.5" style="width:{category.shareA}%;background:var(--slice-1)"></div>
          <div class="h-1.5" style="width:{category.shareB}%;background:var(--slice-2)"></div>
        </div>
        <span class="text-muted-foreground w-16 shrink-0 text-right font-mono text-[0.625rem]">
          {formatNumber(category.a)}/{formatNumber(category.b)}
        </span>
      </div>
    {/each}
  </div>
{:else}
  <p class="text-muted-foreground text-xs">No values at this node.</p>
{/if}
