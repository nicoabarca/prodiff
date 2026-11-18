<script lang="ts" generics="Props extends Record<string, unknown>">
  import type { Component } from "svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";

  let { component: Inner, props }: { component: Component<Props>; props: Props } = $props();
</script>

<Tooltip.Provider>
  <Inner {...props} />
</Tooltip.Provider>
