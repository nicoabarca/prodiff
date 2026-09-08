<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  let { children } = $props();
</script>

<!--
  The app has no dark mode switch, so the toaster is pinned light: left to
  mode-watcher it follows the system preference and turns black on a light page.
-->
<Toaster position="top-right" theme="light" richColors closeButton />

<Tooltip.Provider>
  {@render children()}
</Tooltip.Provider>
