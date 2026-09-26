<script lang="ts">
  import { untrack } from "svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Project } from "$lib/event-log/types";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import { SAMPLE_PROJECT_ID } from "$lib/sample-project/manifest";
  import { startTour, stopTour, tour } from "$lib/tour/state/runner.svelte";
  import { hasSeen, loadToursSeen, markSeen, toursSeen } from "$lib/tour/state/seen.svelte";
  import { TOURS, tourFor } from "$lib/tour/tours";
  import type { TourId } from "$lib/tour/types";
  import CircleHelp from "@lucide/svelte/icons/circle-help";

  let { project, view }: { project: Project; view: string } = $props();

  const tourId = $derived(project.id === SAMPLE_PROJECT_ID ? tourFor(view) : null);
  const ready = $derived(groupsLoaded.projectId === project.id);

  function start(id: TourId) {
    startTour(id, TOURS[id], () => markSeen(id));
  }

  $effect(() => {
    if (!toursSeen.loaded) loadToursSeen();
  });

  // A Tour starts on its own the first time its view opens on the Sample Project.
  $effect(() => {
    if (!tourId || !ready || !toursSeen.loaded || hasSeen(tourId)) return;
    untrack(() => {
      if (tour.running === null) start(tourId);
    });
  });

  // Leaving the view ends its Tour.
  $effect(() => {
    void view;
    return () => stopTour();
  });
</script>

{#if tourId}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-sm"
          onclick={() => start(tourId)}
          aria-label="Take the tour"
        >
          <CircleHelp />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>Take the tour</Tooltip.Content>
  </Tooltip.Root>
{/if}
