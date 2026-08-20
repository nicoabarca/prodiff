import { invoke } from "@tauri-apps/api/core";
import type { EventLogPreview } from "$lib/event-log/invokers/types";

export function fetchEventLogPreview(filePath: string): Promise<EventLogPreview> {
  return invoke<EventLogPreview>("preview_event_log", { path: filePath });
}
