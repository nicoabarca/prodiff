import type { ColumnMapping } from "$lib/column-mapping";

export interface Project {
  id: string;
  name: string;
  fileName: string;
  columns: ColumnMapping[];
  hiddenColumns: string[];
  events: number;
  cases: number;
  activities: number;
  variants: number;
  timespanStart: string | null;
  timespanEnd: string | null;
  createdAt: string;
}
