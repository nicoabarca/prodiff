import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { DayLoad } from "$lib/filters/invokers/types";

/** Cases per day over `chain`'s population, for the timeframe brush. */
export function dailyCaseLoad(project: Project, chain: Filter[]): Promise<DayLoad[]> {
  return invoke<DayLoad[]>("daily_case_load", {
    projectId: project.id,
    chain,
    columns: project.columns
  });
}
