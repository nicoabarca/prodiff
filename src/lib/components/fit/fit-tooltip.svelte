<script lang="ts">
  /**
   * Draws `fitTip`. Mounted once inside the app's `Tooltip.Provider`; a `Fit`
   * with no `FitTooltip` mounted shows no tooltip.
   */
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { FIT_TIP_ID, fitTip, hideFitTip } from "$lib/components/fit/fit-tip.svelte";
</script>

<Tooltip.Root
  open={fitTip.anchor !== null}
  onOpenChange={(open) => {
    if (!open) hideFitTip(null);
  }}
>
  <Tooltip.Content id={FIT_TIP_ID} customAnchor={fitTip.anchor} class="[overflow-wrap:break-word]"
    >{fitTip.text}</Tooltip.Content
  >
</Tooltip.Root>
