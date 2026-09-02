<script lang="ts">
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { view } from "$lib/dfg/state/view.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { formatNumber } from "$lib/format";

  let { simplified }: { simplified: Simplified } = $props();

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
  class="border-border bg-background/90 absolute top-4 right-4 z-10 flex gap-5 rounded-[0.5rem] border px-4 py-3 backdrop-blur"
>
  <div class="flex w-20 flex-col items-center gap-2">
    <span class="text-[0.625rem] font-medium tracking-wide uppercase">Behaviour</span>
    <span class="font-mono text-xs font-semibold">{Math.round(covered * 100)}%</span>
    <Slider
      type="single"
      orientation="vertical"
      class="h-40"
      value={view.coverage}
      onValueChange={(next: number) => (view.coverage = next)}
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
    <span class="font-mono text-xs font-semibold">{Math.round(view.paths * 100)}%</span>
    <Slider
      type="single"
      orientation="vertical"
      class="h-40"
      value={view.paths}
      onValueChange={(next: number) => (view.paths = next)}
      min={0}
      max={1}
      step={0.01}
    />
    <span class="text-muted-foreground font-mono text-[0.625rem]">
      {simplified.paths.shown}/{simplified.paths.total}
    </span>
  </div>
</div>
