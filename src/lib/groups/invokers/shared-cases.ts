import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";

/** Cases in both Groups. Reported rather than removed (see `docs/adr/0006`). */
export function fetchSharedCases(
  project: Project,
  groupA: string,
  groupB: string
): Promise<number> {
  return invoke<number>("shared_cases", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns
  });
}
