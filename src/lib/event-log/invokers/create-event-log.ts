import { invoke } from "@tauri-apps/api/core";
import type { RequestColumnMapping, ResponseCreateEventLog } from "$lib/event-log/invokers/types";

/** Writes the Event Log to disk under `projectId` and returns its statistics. */
export function createEventLog(
  projectId: string,
  sourcePath: string,
  columns: RequestColumnMapping[]
): Promise<ResponseCreateEventLog> {
  return invoke<ResponseCreateEventLog>("create_event_log", { projectId, sourcePath, columns });
}
