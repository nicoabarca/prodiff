<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Fit from "$lib/components/fit/fit.svelte";
  import FitTooltip from "$lib/components/fit/fit-tooltip.svelte";

  let { text, focusable = true }: { text: string; focusable?: boolean } = $props();
</script>

<Tooltip.Provider>
  <FitTooltip />
  <Fit {text} {focusable} />
</Tooltip.Provider>
