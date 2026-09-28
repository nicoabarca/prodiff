<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { Project } from "$lib/event-log/types";
  import { launchTour, projectTour } from "$lib/tour/tours";
  import CircleHelp from "@lucide/svelte/icons/circle-help";

  let { project, view }: { project: Project; view: string } = $props();

  const tourId = $derived(projectTour(project.id, view));
</script>

{#if tourId}
  <Sidebar.MenuButton
    class="cursor-pointer"
    tooltipContent="Take the tour"
    onclick={() => launchTour(tourId)}
  >
    <CircleHelp />
    <span>Take the tour</span>
  </Sidebar.MenuButton>
{/if}
