import { SAMPLE_PROJECT_ID } from "$lib/sample-project/manifest";
import { startTour } from "$lib/tour/state/runner.svelte";
import { markSeen } from "$lib/tour/state/seen.svelte";
import { dfgTour } from "$lib/tour/steps/dfg";
import { distributionsTour } from "$lib/tour/steps/distributions";
import { filtersTour } from "$lib/tour/steps/filters";
import { statisticsTour } from "$lib/tour/steps/statistics";
import { treeTour } from "$lib/tour/steps/tree";
import type { TourId, TourStep } from "$lib/tour/types";

export const TOURS: Record<TourId, TourStep[]> = {
  statistics: statisticsTour,
  filters: filtersTour,
  tree: treeTour,
  distributions: distributionsTour,
  dfg: dfgTour
};

/** The Tour for a project view, or null when that view has none. */
export function tourFor(view: string): TourId | null {
  return view in TOURS ? (view as TourId) : null;
}

/** The Tour a view offers in this project: only the Sample Project has any. */
export function projectTour(projectId: string, view: string): TourId | null {
  return projectId === SAMPLE_PROJECT_ID ? tourFor(view) : null;
}

/** Starts a Tour, marking it seen however it ends. */
export function launchTour(id: TourId) {
  startTour(id, TOURS[id], () => markSeen(id));
}
