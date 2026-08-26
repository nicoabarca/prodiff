<script lang="ts">
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { allGroups, computeStats, filtersKey } from "$lib/groups/state/groups.svelte";
  import type { Group } from "$lib/groups/types";
  import ComparisonCharts from "$lib/statistics/components/comparison-charts.svelte";
  import MetricsTable from "$lib/statistics/components/metrics-table.svelte";
  import EventDataTable from "$lib/statistics/components/event-data-table.svelte";
  import EventLogSettings from "$lib/event-log/components/event-log-settings.svelte";
  import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

  const project = $derived(currentProject());
  const shown = $derived(project ? allGroups(project.id) : []);

  let stats = $state<Record<string, ResponseEventLogStats>>({});
  let error = $state<string | null>(null);

  /** Identifies the Groups on screen. */
  const wantedKey = $derived(
    shown.map((group) => `${group.id}:${filtersKey(group.filters)}`).join("|")
  );

  let lastKey = "";
  $effect(() => {
    const key = wantedKey;
    const currentProjectValue = project;
    const wanted: Group[] = shown;
    if (!currentProjectValue || key === lastKey) return;
    lastKey = key;

    error = null;
    computeStats(currentProjectValue, wanted)
      .then((result) => {
        stats = result;
      })
      .catch((cause) => {
        error = String(cause);
        // A failed run must not be marked done, or it would never retry.
        lastKey = "";
      });
  });
</script>

{#if project}
  <main class="bg-sidebar min-h-0 flex-1 overflow-auto p-5">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {#if error}
        <p class="border-destructive/50 text-destructive border p-4 text-sm">{error}</p>
      {/if}
      <EventLogSettings {project} />
      <ComparisonCharts groups={shown} {stats} />
      <MetricsTable groups={shown} {stats} />
      <EventDataTable {project} groups={shown} />
    </div>
  </main>
{/if}
