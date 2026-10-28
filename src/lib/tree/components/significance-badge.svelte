<script lang="ts">
  /**
   * How many significant differences a node carries, on its top right corner,
   * filled with the `--effect-*` step of the strongest one.
   */
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { EffectBand } from "$lib/tree/types";

  let { count, step, band }: { count: number; step: 1 | 2 | 3 | 4; band: EffectBand } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger
    class="absolute -top-2 -right-2 flex size-4.5 items-center justify-center rounded-full bg-(--fill) font-mono text-[0.625rem] font-semibold text-(--ink) ring-1 ring-(--ink)/30"
    style="--fill:var(--effect-{step});--ink:var(--effect-{step}-foreground)"
  >
    {count}
  </Tooltip.Trigger>
  <Tooltip.Content>
    {count} significant difference{count === 1 ? "" : "s"} here · strongest is {band}
  </Tooltip.Content>
</Tooltip.Root>
