import { invoke } from "@tauri-apps/api/core";
import type { ColumnMapping, ResponseCreateEventLog } from "$lib/event-log/invokers/types";

/** Writes the Event Log to disk under `projectId` and returns its statistics. */
export function createEventLog(
  projectId: string,
  sourcePath: string,
  columns: ColumnMapping[]
): Promise<ResponseCreateEventLog> {
  return invoke<ResponseCreateEventLog>("create_event_log", { projectId, sourcePath, columns });
}
