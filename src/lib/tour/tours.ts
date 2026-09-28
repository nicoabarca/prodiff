import { filtersTour } from "$lib/tour/steps/filters";
import type { TourId, TourStep } from "$lib/tour/types";

export const TOURS: Record<TourId, TourStep[]> = {
  filters: filtersTour
};

/** The Tour for a project view, or null when that view has none. */
export function tourFor(view: string): TourId | null {
  return view in TOURS ? (view as TourId) : null;
}
