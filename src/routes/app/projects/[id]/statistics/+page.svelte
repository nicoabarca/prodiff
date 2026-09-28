<script lang="ts">
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import StatisticsView from "$lib/statistics/components/statistics-view.svelte";

  const project = $derived(currentProject());
</script>

{#if project}
  <StatisticsView {project} />
{/if}
