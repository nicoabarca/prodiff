import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/** Runs a Group's Filter List, writes the result as Parquet and returns its figures. */
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
