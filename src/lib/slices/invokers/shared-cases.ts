import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";

/** Cases that survive both chains — the overlap of two slices' populations. */
export function fetchSharedCases(
  project: Project,
  chainA: Filter[],
  chainB: Filter[]
): Promise<number> {
  return invoke<number>("shared_cases", {
    projectId: project.id,
    chainA,
    chainB,
    columns: project.columns
  });
}
