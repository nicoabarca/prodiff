<script lang="ts">
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { knobs, setCoverage, setPaths } from "$lib/dfg/state/view.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { formatNumber } from "$lib/format";

  let {
    simplified,
    side = "left",
    width = $bindable(0)
  }: { simplified: Simplified; side?: "left" | "right"; width?: number } = $props();

  const mine = $derived(knobs(side));

  /**
   * What the top slider reports is what it bought, not where it sits: shapes
   * enter whole, so the share of cases covered lands above where it was set.
   */
  const covered = $derived(
    simplified.variants.totalCases === 0
      ? 0
      : simplified.variants.cases / simplified.variants.totalCases
  );
</script>

<div
  bind:clientWidth={width}
  data-tour="simplification-controls"
  class="border-border bg-background/90 absolute top-4 z-10 flex gap-5 rounded-[0.5rem] border px-4 py-3 backdrop-blur {side ===
  'right'
    ? 'right-4'
    : 'left-4'}"
>
  <div class="flex w-20 flex-col items-center gap-2">
    <span class="text-[0.625rem] font-medium tracking-wide uppercase">Behaviour</span>
    <span class="font-mono text-xs font-semibold">{Math.round(covered * 100)}%</span>
    <Slider
      type="single"
      orientation="vertical"
      class="h-40"
      value={mine.coverage}
      onValueChange={(next: number) => setCoverage(side, next)}
      min={0}
      max={1}
      step={0.01}
    />
    <div class="text-muted-foreground flex flex-col items-center font-mono text-[0.625rem]">
      <span>{simplified.variants.shown}/{simplified.variants.total} variants</span>
      <span>{simplified.activities.shown}/{simplified.activities.total} activities</span>
      <span>{formatNumber(simplified.variants.cases)} cases</span>
    </div>
  </div>

  <div class="flex w-16 flex-col items-center gap-2">
    <span class="text-[0.625rem] font-medium tracking-wide uppercase">Paths</span>
    <span class="font-mono text-xs font-semibold">{Math.round(mine.paths * 100)}%</span>
    <Slider
      type="single"
      orientation="vertical"
      class="h-40"
      value={mine.paths}
      onValueChange={(next: number) => setPaths(side, next)}
      min={0}
      max={1}
      step={0.01}
    />
    <span class="text-muted-foreground font-mono text-[0.625rem]">
      {simplified.paths.shown}/{simplified.paths.total}
    </span>
  </div>
</div>
