import { invoke } from "@tauri-apps/api/core";

/** Removes the Draft Parquet read from the upload at `filePath`, if it has one. */
export function discardEventLogDraft(filePath: string): Promise<void> {
  return invoke<void>("discard_event_log_draft", { path: filePath });
}
