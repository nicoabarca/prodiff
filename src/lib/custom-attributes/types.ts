import type { AttributeScope } from "$lib/custom-attributes/invokers/types";

/**
 * A formula over the Event Log's visible number columns, written to the Parquet
 * as the column `fx_{id}`. An Event attribute is computed for every event; a
 * Case attribute once per case, over the whole case. `emptyCount` counts
 * events for Event scope and cases for Case scope, and is null while the
 * column has not been written yet.
 */
export interface CustomAttribute {
  id: string;
  projectId: string;
  name: string;
  scope: AttributeScope;
  formula: string;
  position: number;
  emptyCount: number | null;
  createdAt: string;
  editedAt: string;
}
