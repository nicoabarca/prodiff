import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";

/**
 * Builds the whole graph from the Groups' materialized Parquet files. `groups`
 * is ordered and holds one or two ids; one is single-Group mode, which ships
 * counts and Summaries but no Significance Test.
 *
 * Nothing about the drawing crosses the seam: the simplification thresholds and
 * the layout are the frontend's, so moving a slider never calls this again.
 */
export function dfg(
  project: Project,
  groups: string[],
  attributes: string[]
): Promise<ResponseDfg> {
  return invoke<ResponseDfg>("dfg", {
    projectId: project.id,
    groups,
    attributes,
    columns: project.columns
  });
}
