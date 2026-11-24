<svelte:options namespace="svg" />

<script lang="ts">
  /**
   * One Group's outliers as a tail histogram: bars binned along the value
   * axis and mirrored across the band, each as thick as its share of the
   * Group's `n` cases. `position` maps a value to pixels on the value axis,
   * `middle` and `full` are the band's centre and width in pixels.
   */
  import { tailBins, tailThickness } from "$lib/analysis/utils/box-plot";

  let {
    values,
    n,
    color,
    horizontal,
    position,
    middle,
    full
  }: {
    values: number[];
    n: number;
    color: string;
    horizontal: boolean;
    position: (value: number) => number;
    middle: number;
    full: number;
  } = $props();

  /** Pixels each bar covers along the value axis. */
  const BIN = 4;
</script>

{#each tailBins(values.map(position), BIN) as bin (bin.start)}
  {@const thickness = Math.max(2, tailThickness(bin.count, n) * full)}
  <rect
    x={horizontal ? bin.start : middle - thickness / 2}
    y={horizontal ? middle - thickness / 2 : bin.start}
    width={horizontal ? BIN - 1 : thickness}
    height={horizontal ? thickness : BIN - 1}
    fill={color}
    fill-opacity="0.55"
    class="pointer-events-none"
    data-tail-count={bin.count}
  />
{/each}
