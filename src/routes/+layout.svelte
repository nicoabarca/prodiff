<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import DatabaseProblem from "$lib/db/components/database-problem.svelte";
  import { offerUpdate } from "$lib/updater/offer-update";
  import { onMount } from "svelte";
  let { children, data } = $props();

  onMount(() => {
    if (!import.meta.env.DEV) offerUpdate();
  });
</script>

<!--
  The app has no dark mode switch, so the toaster is pinned light: left to
  mode-watcher it follows the system preference and turns black on a light page.
-->
<Toaster position="top-right" theme="light" richColors closeButton />

{#if data.dbProblem}
  <DatabaseProblem problem={data.dbProblem} />
{:else}
  <Tooltip.Provider>
    {@render children()}
  </Tooltip.Provider>
{/if}
