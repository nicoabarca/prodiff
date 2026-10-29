import { invoke } from "@tauri-apps/api/core";
import type { ResponseOpenBundle } from "$lib/project-import/invokers/types";

/**
 * Reads the manifest of the study bundle at `path`, a `.zip` or the folder it
 * unzips into. A zip's CSV is extracted until the next import ends.
 */
export function openBundle(path: string): Promise<ResponseOpenBundle> {
  return invoke<ResponseOpenBundle>("open_bundle", { path });
}
