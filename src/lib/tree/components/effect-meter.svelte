<script lang="ts">
  /**
   * A test's magnitude as four rounded bars, each filled in its own step on
   * the `--effect-*` ramp up to the test's step and grey after it. `vertical`
   * stacks them bottom up, largest on top, on a card coloured chip whose
   * radius is the bars' radius plus its padding.
   */
  import type { EffectBand } from "$lib/tree/types";
  import { effectColor, type EffectStep } from "$lib/tree/utils/effect";
  import { cn } from "$lib/utils";

  let {
    step,
    vertical = false,
    class: className
  }: { step: 0 | EffectStep; vertical?: boolean; class?: string } = $props();

  const BANDS: EffectBand[] = ["negligible", "small", "moderate", "large"];
</script>

<span
  class={cn(
    "flex gap-[0.0625rem]",
    vertical
      ? "bg-card ring-border w-3 flex-col items-center rounded-[0.21875rem] p-0.5 shadow-sm ring-1"
      : "items-center",
    className
  )}
  role="img"
  aria-label={step ? `Magnitude: ${BANDS[step - 1]}` : "No magnitude"}
>
  {#each (vertical ? [4, 3, 2, 1] : [1, 2, 3, 4]) as EffectStep[] as i (i)}
    <span
      class={cn(
        "block shrink-0 rounded-[0.09375rem]",
        vertical ? "h-0.75 w-2" : "h-1.5 w-2.5",
        i > step && "bg-muted-foreground/30"
      )}
      style={i <= step ? `background:${effectColor(i).fill}` : undefined}
    ></span>
  {/each}
</span>
