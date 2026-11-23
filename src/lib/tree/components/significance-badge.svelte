<script lang="ts">
  /**
   * How many significant differences a node carries, on its top right corner,
   * filled in the strongest one's step on the effect ramp, with that step as
   * a meter hanging below it.
   */
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { EffectBand } from "$lib/tree/types";
  import { effectColor, type EffectStep } from "$lib/tree/utils/effect";

  let { count, step, band }: { count: number; step: EffectStep; band: EffectBand } = $props();

  const color = $derived(effectColor(step));
</script>

<Tooltip.Root>
  <Tooltip.Trigger
    class="absolute -top-2 -right-2 flex size-4.5 items-center justify-center rounded-full bg-(--fill) font-mono text-[0.625rem] font-semibold text-(--ink) ring-1 ring-(--ink)/30"
    style="--fill:{color.fill};--ink:{color.ink}"
  >
    {count}
    <EffectMeter
      {step}
      vertical
      class="absolute top-[calc(100%+0.1875rem)] left-1/2 -translate-x-1/2"
    />
  </Tooltip.Trigger>
  <Tooltip.Content>
    {count} significant difference{count === 1 ? "" : "s"} here · strongest is {band}
  </Tooltip.Content>
</Tooltip.Root>
