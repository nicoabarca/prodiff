import type { RequestColumnMapping } from "$lib/event-log/invokers/types";

export interface Project {
  id: string;
  name: string;
  fileName: string;
  originalPath: string;
  eventLogPath: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
  events: number;
  cases: number;
  activities: number;
  variants: number;
  timespanStart: string | null;
  timespanEnd: string | null;
  createdAt: string;
}

/** The uploaded file awaiting confirmation, as held by the new-project flow. */
export interface ProjectDraft {
  filePath: string;
  fileName: string;
}

/**
 * What the full-file pass made of one temporal column against the pattern in
 * force. `failed` counts rows carrying a value the pattern cannot read, so it
 * excludes the `nulls`, which count against no pattern.
 */
export interface FormatCheck {
  pattern: string;
  rows: number;
  nulls: number;
  failed: number;
  sample: string | null;
}
