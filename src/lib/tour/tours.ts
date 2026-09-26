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
