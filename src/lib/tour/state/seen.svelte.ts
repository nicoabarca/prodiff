import { readSetting, writeSetting } from "$lib/db/app-settings";
import type { TourId } from "$lib/tour/types";

/** The Tours already finished or dismissed, which never start on their own again. */
export const toursSeen = $state<{ loaded: boolean; ids: string[] }>({ loaded: false, ids: [] });

export async function loadToursSeen() {
  toursSeen.ids = (await readSetting("toursSeen")) ?? [];
  toursSeen.loaded = true;
}

export function hasSeen(id: TourId): boolean {
  return toursSeen.ids.includes(id);
}

export async function markSeen(id: TourId) {
  if (hasSeen(id)) return;
  toursSeen.ids = [...toursSeen.ids, id];
  await writeSetting("toursSeen", toursSeen.ids);
}

/** Lets every Tour start on its own again. */
export async function resetToursSeen() {
  toursSeen.ids = [];
  await writeSetting("toursSeen", []);
}
