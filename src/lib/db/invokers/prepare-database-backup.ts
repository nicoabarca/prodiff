import { invoke } from "@tauri-apps/api/core";

/** Makes room for a backup of the database at `fromVersion` and returns the absolute path to write it to. */
export function prepareDatabaseBackup(fromVersion: number): Promise<string> {
  return invoke<string>("prepare_database_backup", { fromVersion });
}
