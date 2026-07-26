import { invoke } from "@tauri-apps/api/core";
import type { ColumnType } from "$lib/column-mapping";

export interface EventLogPreview {
  columns: { name: string; dtype: ColumnType }[];
  rows: string[][];
}

export function fetchEventLogPreview(filePath: string): Promise<EventLogPreview> {
  return invoke<EventLogPreview>("preview_event_log", { path: filePath });
}
