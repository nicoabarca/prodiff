<script lang="ts">
  /**
   * How many significant differences a node carries, on its top right corner,
   * with the strongest one's magnitude as a meter hanging below it.
   */
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import type { EffectBand } from "$lib/tree/types";

  let { count, step, band }: { count: number; step: 1 | 2 | 3 | 4; band: EffectBand } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger
    class="absolute -top-2 -right-2 flex size-4.5 items-center justify-center rounded-full bg-(--effect) font-mono text-[0.625rem] font-semibold text-(--effect-foreground) ring-1 ring-(--effect-foreground)/30"
  >
    {count}
    <EffectMeter
      {step}
      vertical
      class="absolute top-[calc(100%+0.0625rem)] left-1/2 -translate-x-1/2"
    />
  </Tooltip.Trigger>
  <Tooltip.Content>
    {count} significant difference{count === 1 ? "" : "s"} here · strongest is {band}
  </Tooltip.Content>
</Tooltip.Root>
