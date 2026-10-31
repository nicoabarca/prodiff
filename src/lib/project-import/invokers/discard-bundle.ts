import { invoke } from "@tauri-apps/api/core";

/** Removes whatever `openBundle` extracted, for an import that will not run. */
export function discardBundle(): Promise<void> {
  return invoke<void>("discard_bundle");
}
