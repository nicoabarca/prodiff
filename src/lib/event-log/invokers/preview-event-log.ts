import { invoke } from "@tauri-apps/api/core";
import type { ResponseEventLogPreview } from "$lib/event-log/invokers/types";

export function fetchEventLogPreview(filePath: string): Promise<ResponseEventLogPreview> {
  return invoke<ResponseEventLogPreview>("preview_event_log", { path: filePath });
}
