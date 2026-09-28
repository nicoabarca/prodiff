import { invoke } from "@tauri-apps/api/core";
import type { ResponseColumnProfile } from "$lib/event-log/invokers/types";

/** A few values and the fill rate of each named column of the stored Event Log. */
export function columnProfiles(
  projectId: string,
  columns: string[]
): Promise<ResponseColumnProfile[]> {
  return invoke<ResponseColumnProfile[]>("column_profiles", { projectId, columns });
}
