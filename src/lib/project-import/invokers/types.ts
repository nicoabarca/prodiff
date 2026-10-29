/**
 * The invocation contracts for the study import commands. Every type here
 * mirrors a serde struct in `src-tauri/src/project_import/`.
 */
import type {
  RequestCustomAttribute,
  ResponseEmptyCount
} from "$lib/custom-attributes/invokers/types";
import type { RequestColumnMapping, ResponseCreateEventLog } from "$lib/event-log/invokers/types";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { Group } from "$lib/groups/types";

/** A bundle's manifest as text, and where its CSV is on disk. */
export interface ResponseOpenBundle {
  manifestText: string;
  csvPath: string;
  csvFileName: string;
}

/** Mirrors `BuildInput`. */
export interface RequestImportProject {
  columns: RequestColumnMapping[];
  customAttributes: RequestCustomAttribute[];
  groups: Pick<Group, "id" | "filters">[];
}

/** Mirrors `Built`. `groups` follows the order the Groups were sent in. */
export interface ResponseImportProject {
  eventLog: ResponseCreateEventLog;
  customAttributes: ResponseEmptyCount[];
  groups: ResponseEventLogStats[];
}
