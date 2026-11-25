<script lang="ts">
  /**
   * A test's magnitude as four rounded bars, filled in the test's step on the
   * `--effect-*` ramp up to that step and faint grey after it. `vertical`
   * stacks them bottom up, largest on top, on a card coloured chip whose
   * radius is the bars' radius plus its padding, ringed in the test's step.
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
  const fill = $derived(step === 0 ? null : effectColor(step).fill);
</script>

<span
  class={cn(
    "flex gap-[0.0625rem]",
    vertical
      ? "bg-card w-3.5 flex-col items-center rounded-[0.21875rem] p-0.5 shadow-sm ring-1"
      : "items-center",
    className
  )}
  style={vertical
    ? `--tw-ring-color:${step ? effectColor(step).fill : "var(--border)"}`
    : undefined}
  role="img"
  aria-label={step ? `Magnitude: ${BANDS[step - 1]}` : "No magnitude"}
>
  {#each (vertical ? [4, 3, 2, 1] : [1, 2, 3, 4]) as EffectStep[] as i (i)}
    <span
      class={cn(
        "block shrink-0 rounded-[0.09375rem]",
        "h-1.5 w-2.5",
        i > step && "bg-muted-foreground/15"
      )}
      style={i <= step && fill ? `background:${fill}` : undefined}
    ></span>
  {/each}
</span>
