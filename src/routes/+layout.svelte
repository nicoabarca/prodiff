<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import BootScreen from "$lib/db/components/boot-screen.svelte";
  import DatabaseProblem from "$lib/db/components/database-problem.svelte";
  import { dbProblem, initDb } from "$lib/db/client";
  import { boot } from "$lib/db/state/boot.svelte";
  import type { DbProblem } from "$lib/db/types";
  import { loadProjects, projects } from "$lib/event-log/state/projects.svelte";
  import { offerUpdate } from "$lib/updater/offer-update";
  import { onMount } from "svelte";
  let { children } = $props();

  let problem = $state<DbProblem | null>(null);

  onMount(async () => {
    try {
      await initDb();
    } catch (error) {
      problem = dbProblem(error);
      return;
    }
    boot.stage = "loading";
    await loadProjects();
    boot.stage = "ready";
    if (!import.meta.env.DEV) offerUpdate();
  });
</script>

<!--
  The app has no dark mode switch, so the toaster is pinned light: left to
  mode-watcher it follows the system preference and turns black on a light page.
-->
<Toaster position="top-right" theme="light" richColors closeButton />

{#if import.meta.env.DEV}
  {#await import("$lib/devtools/picker/components/picker.svelte") then { default: Picker }}
    <Picker />
  {/await}
{/if}

{#if problem}
  <DatabaseProblem {problem} />
{:else if boot.stage !== "ready"}
  <BootScreen projectCount={projects.length} />
{:else}
  <Tooltip.Provider>
    {@render children()}
  </Tooltip.Provider>
{/if}
