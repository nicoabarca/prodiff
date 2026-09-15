import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { E2E_IDENTIFIER } from "./target.ts";

// Tauri's `app_data_dir` for the e2e identifier.
export function appDataDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library/Application Support", E2E_IDENTIFIER);
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData/Roaming"),
        E2E_IDENTIFIER
      );
    default:
      return path.join(
        process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local/share"),
        E2E_IDENTIFIER
      );
  }
}

export function wipeAppData(): void {
  rmSync(appDataDir(), { recursive: true, force: true });
}
