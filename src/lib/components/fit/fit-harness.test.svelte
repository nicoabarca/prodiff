<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Fit from "$lib/components/fit/fit.svelte";

  let { text, focusable = true }: { text: string; focusable?: boolean } = $props();
</script>

<Tooltip.Provider>
  <Fit {text} {focusable} />
</Tooltip.Provider>
