import { invoke } from "@tauri-apps/api/core";

export function fetchEventLogFileSize(filePath: string): Promise<number> {
  return invoke<number>("event_log_file_size", { path: filePath });
}
