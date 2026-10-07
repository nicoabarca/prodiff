<script lang="ts">
  /**
   * The two cuts the drawing is made with. Both answer from the graph already in
   * hand, so neither rebuilds; moving one reframes what is left on screen. A
   * split draws both panels from this one pair.
   */
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { setCoverage, setPaths, view } from "$lib/dfg/state/view.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { formatNumber } from "$lib/format";
  import Info from "@lucide/svelte/icons/info";

  let { simplified }: { simplified: Simplified } = $props();

  /**
   * What the Behaviour slider reports is what it bought, not where it sits:
   * Variants enter whole, so the share of cases covered lands above where it
   * was set.
   */
  const covered = $derived(
    simplified.variants.totalCases === 0
      ? 0
      : simplified.variants.cases / simplified.variants.totalCases
  );

  const HINT = "text-muted-foreground hover:text-foreground shrink-0 cursor-help";
  const CAPTION = "text-muted-foreground text-[0.625rem] font-semibold tracking-wide uppercase";
  const VALUE = "w-8 text-right font-mono text-xs font-semibold tabular-nums";
  const CARD = "flex flex-col gap-0.5 whitespace-nowrap";
</script>

<div
  data-tour="simplification-controls"
  class="border-border flex shrink-0 items-center gap-8 border-l px-4"
>
  <div class="flex items-center gap-1">
    <span class={CAPTION}>Behaviour</span>
    <Slider
      type="single"
      class="w-24"
      aria-label="Behaviour covered"
      value={view.coverage}
      onValueChange={setCoverage}
      min={0}
      max={1}
      step={0.01}
    />
    <span class="flex items-center gap-1">
      <span class={VALUE}>{Math.round(covered * 100)}%</span>
      <Tooltip.Root>
        <Tooltip.Trigger class={HINT} aria-label="What the Behaviour slider cuts">
          <Info class="size-3.5" />
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-none items-start">
          <span class={CARD}>
            <span>The most common variants, up to this share of cases.</span>
            <span class="font-mono">
              {formatNumber(simplified.variants.shown)}/{formatNumber(simplified.variants.total)}
              variants · {formatNumber(simplified.activities.shown)}/{formatNumber(
                simplified.activities.total
              )} activities · {formatNumber(simplified.variants.cases)} cases
            </span>
          </span>
        </Tooltip.Content>
      </Tooltip.Root>
    </span>
  </div>

  <div class="flex items-center">
    <span class={CAPTION}>Paths</span>
    <Slider
      type="single"
      class="w-24"
      aria-label="Paths kept"
      value={view.paths}
      onValueChange={setPaths}
      min={0}
      max={1}
      step={0.01}
    />
    <span class="flex items-center gap-1">
      <span class={VALUE}>{Math.round(view.paths * 100)}%</span>
      <Tooltip.Root>
        <Tooltip.Trigger class={HINT} aria-label="What the Paths slider cuts">
          <Info class="size-3.5" />
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-none items-start">
          <span class={CARD}>
            <span>The busiest transitions between the activities left.</span>
            <span class="font-mono">
              {formatNumber(simplified.paths.shown)}/{formatNumber(simplified.paths.total)} paths
            </span>
          </span>
        </Tooltip.Content>
      </Tooltip.Root>
    </span>
  </div>
</div>
