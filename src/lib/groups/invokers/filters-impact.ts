import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseFilterStep } from "$lib/groups/invokers/types";

/**
 * Sizes after each prefix of `filters`: index 0 is the unfiltered log, index
 * `i + 1` the result after filter `i`. This is the draft preview — it writes
 * nothing, and its numbers belong to the draft rather than to a Group.
 */
export function filtersImpact(project: Project, filters: Filter[]): Promise<ResponseFilterStep[]> {
  return invoke<ResponseFilterStep[]>("filters_impact", {
    projectId: project.id,
    filters,
    columns: project.columns
  });
}
