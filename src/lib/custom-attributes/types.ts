/**
 * A formula over the Event Log's visible number columns, computed for every
 * event and written to the Parquet as the column `fx_{id}`. A null `emptyCount`
 * means the column has not been written yet.
 */
export interface CustomAttribute {
  id: string;
  projectId: string;
  name: string;
  formula: string;
  position: number;
  emptyCount: number | null;
  createdAt: string;
  editedAt: string;
}
