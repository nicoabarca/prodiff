<script lang="ts">
  /** Starts a view's Tour the first time it opens and ends it on leaving. Renders nothing. */
  import { untrack } from "svelte";
  import type { Project } from "$lib/event-log/types";
  import { groupsLoaded } from "$lib/groups/state/groups.svelte";
  import { stopTour, tour } from "$lib/tour/state/runner.svelte";
  import { hasSeen, loadToursSeen, toursSeen } from "$lib/tour/state/seen.svelte";
  import { launchTour, projectTour } from "$lib/tour/tours";

  let { project, view }: { project: Project; view: string } = $props();

  const tourId = $derived(projectTour(project.id, view));
  const ready = $derived(groupsLoaded.projectId === project.id);

  $effect(() => {
    if (!toursSeen.loaded) loadToursSeen();
  });

  // A Tour starts on its own the first time its view opens on the Sample Project.
  $effect(() => {
    if (!tourId || !ready || !toursSeen.loaded || hasSeen(tourId)) return;
    untrack(() => {
      if (tour.running === null) launchTour(tourId);
    });
  });

  // Leaving the view ends its Tour.
  $effect(() => {
    void view;
    return () => stopTour();
  });
</script>
