import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/**
 * Materializes a Group: runs its Filter List and writes the result as Parquet.
 * The figures come back from the same pass that wrote the file, so the caller
 * never needs a second call to fill its cache.
 */
export function applyGroup(
  project: Project,
  groupId: string,
  filters: Filter[]
): Promise<ResponseEventLogStats> {
  return invoke<ResponseEventLogStats>("apply_group", {
    projectId: project.id,
    groupId,
    filters,
    columns: project.columns
  });
}
