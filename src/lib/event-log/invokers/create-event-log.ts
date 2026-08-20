import { invoke } from "@tauri-apps/api/core";
import type { ColumnMapping, CreateEventLogResult } from "$lib/event-log/invokers/types";

/** Writes the Event Log to disk under `projectId` and returns its statistics. */
export function createEventLog(
  projectId: string,
  sourcePath: string,
  columns: ColumnMapping[]
): Promise<CreateEventLogResult> {
  return invoke<CreateEventLogResult>("create_event_log", { projectId, sourcePath, columns });
}
