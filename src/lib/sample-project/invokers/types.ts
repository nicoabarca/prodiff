import type { ResponseCreateEventLog } from "$lib/event-log/invokers/types";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/** Mirrors `ImportWithGroups` in Rust. `groups` follows the order the Groups were sent in. */
export interface ResponseCreateSampleProject {
  eventLog: ResponseCreateEventLog;
  groups: ResponseEventLogStats[];
}
