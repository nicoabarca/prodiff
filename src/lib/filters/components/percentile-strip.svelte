<script lang="ts">
  /**
   * A numeric column as one bar, where position is the share of values and the
   * labels are the value at that share. What the filter keeps takes the Group's
   * accent and each bound the mode uses is drawn as a rule.
   */
  import * as Field from "$lib/components/ui/field/index.js";
  import type { NumericMode } from "$lib/filters/kind/numeric";
  import {
    keptSpans,
    shareAtOrBelow,
    shareBelow,
    spannedShare,
    valueAt
  } from "$lib/filters/utils/percentiles";
  import { formatNumber } from "$lib/format";

  let {
    points,
    mode,
    min,
    max,
    color,
    unit
  }: {
    points: number[];
    mode: NumericMode;
    min: number | null;
    max: number | null;
    color: string;
    unit: "cases" | "events";
  } = $props();

  const TICK_SHARES = [0, 0.25, 0.5, 0.75, 0.9, 1];

  const percent = (share: number) => `${Math.round(share * 100)}%`;

  const spans = $derived(keptSpans(points, mode, min, max));
  const rules = $derived(
    [
      mode === "below" || min === null ? null : shareBelow(points, min),
      mode === "above" || max === null ? null : shareAtOrBelow(points, max)
    ].filter((share): share is number => share !== null)
  );

  let hovered = $state<number | null>(null);
  const readout = $derived.by(() => {
    if (hovered !== null) {
      const value = valueAt(points, hovered);
      const share = (shareAtOrBelow(points, value) * 100).toFixed(1);
      return `${share}% of ${unit} at or below ${formatNumber(value)}`;
    }
    return rules.length > 0 ? `Keeps ${percent(spannedShare(spans))} of ${unit}` : "";
  });

  function track(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    hovered = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
  }

  /** Shifts a label left by its share, so the first and last stay inside the bar. */
  const anchored = (share: number) =>
    `left: ${share * 100}%; transform: translateX(-${share * 100}%)`;
</script>

<Field.Field>
  <div class="flex items-center gap-2">
    <Field.FieldLabel>Share of {unit} by value</Field.FieldLabel>
    <span class="text-muted-foreground ml-auto font-mono text-xs">{readout}</span>
  </div>

  <div class="grid gap-1">
    <div class="relative h-4 font-mono text-xs">
      {#each TICK_SHARES as share (share)}
        <span class="absolute whitespace-nowrap" style={anchored(share)}>
          {formatNumber(valueAt(points, share))}
        </span>
      {/each}
    </div>

    <div
      role="img"
      aria-label={readout || `Share of ${unit} by value`}
      data-slot="percentile-strip"
      class="bg-muted-foreground/30 relative h-10 w-full"
      onpointermove={track}
      onpointerleave={() => (hovered = null)}
    >
      {#each spans as [start, end] (start)}
        <div
          data-slot="percentile-kept"
          class="absolute inset-y-0"
          style="left: {start * 100}%; width: {(end - start) * 100}%; background: {color}"
        ></div>
      {/each}
      {#each rules as share}
        <div
          data-slot="percentile-rule"
          class="bg-foreground absolute -inset-y-0.5 w-0.5 -translate-x-1/2"
          style="left: {share * 100}%"
        ></div>
      {/each}
    </div>

    <div class="text-muted-foreground relative h-4 text-xs">
      {#each TICK_SHARES as share (share)}
        <span class="absolute whitespace-nowrap" style={anchored(share)}>{percent(share)}</span>
      {/each}
    </div>
  </div>
</Field.Field>
