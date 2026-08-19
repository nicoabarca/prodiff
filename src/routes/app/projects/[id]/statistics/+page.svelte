<script lang="ts">
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { chainKey, computeStats, populations } from "$lib/slices/state/slices.svelte";
  import type { Population } from "$lib/slices/types";
  import ComparisonCharts from "$lib/statistics/components/comparison-charts.svelte";
  import MetricsTable from "$lib/statistics/components/metrics-table.svelte";
  import EventDataTable from "$lib/statistics/components/event-data-table.svelte";
  import EventLogSettings from "$lib/event-log/components/event-log-settings.svelte";
  import type { EventLogStats } from "$lib/slices/invokers/types";

  const project = $derived(currentProject());
  const pops = $derived(populations());

  let stats = $state<Record<string, EventLogStats>>({});
  let error = $state<string | null>(null);

  /**
   * Identifies the set of chains on screen. Recomputing is keyed on this rather
   * than on the populations array, which is rebuilt on every slice mutation —
   * including the cache write that `computeStats` itself performs.
   */
  const wantedKey = $derived(pops.map((p) => `${p.id}:${chainKey(p.chain)}`).join("|"));

  let lastKey = "";
  $effect(() => {
    const key = wantedKey;
    const currentProjectValue = project;
    const wanted: Population[] = pops;
    if (!currentProjectValue || key === lastKey) return;
    lastKey = key;

    error = null;
    computeStats(currentProjectValue, wanted)
      .then((result) => {
        stats = result;
      })
      .catch((cause) => {
        error = String(cause);
        // A failed run must not be treated as done, or editing a filter back to
        // a previously-failing chain would show nothing and never retry.
        lastKey = "";
      });
  });
</script>

{#if project}
  <main class="bg-sidebar min-h-0 flex-1 overflow-auto p-5">
    <!-- Capped and centred: the tables are read column by column, and a grid
         stretched to a wide window puts the figures too far apart to compare. -->
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {#if error}
        <p class="border-destructive/50 text-destructive border p-4 text-sm">{error}</p>
      {/if}
      <EventLogSettings {project} />
      <ComparisonCharts populations={pops} {stats} />
      <MetricsTable populations={pops} {stats} />
      <EventDataTable {project} populations={pops} />
    </div>
  </main>
{/if}
