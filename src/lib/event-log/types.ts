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
