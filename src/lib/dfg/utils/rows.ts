/**
 * The table behind the graph: one row per activity drawn, one cell per measure
 * the build holds, each cell carrying both Groups' figures, the change between
 * them and the Significance Test behind it.
 *
 * A row's frequencies follow the cut on screen, because the fold does. An
 * attribute's figures are what Rust measured over the built Variants, so they
 * stand still while the sliders move.
 */
import { percentChange } from "$lib/analysis/utils/change";
import type { Test } from "$lib/analysis/types";
import type { DfgNode } from "$lib/dfg/invokers/types";
import type { FaceGroup, Measure } from "$lib/dfg/types";
import {
  measureKey,
  measureTest,
  measureUnion,
  measureValue,
  type Measurable
} from "$lib/dfg/utils/measure";
import type { SimplifiedNode } from "$lib/dfg/utils/simplify";

export interface MeasureCell {
  values: Record<string, number | null>;
  union: number | null;
  delta: number | null;
  test: Test | null;
}

/** `reach` names the Groups that reach the activity at all, in the compared order. */
export interface MeasureRow {
  id: number;
  label: string;
  cells: Record<string, MeasureCell>;
  reach: string[];
}

/** The sort key of the activity column, which is not a measure. */
export const ACTIVITY_KEY = "activity";

/** The sort key of the Δ column, which ranks by how big the difference is. */
export const DELTA_KEY = "delta";

export type SortDirection = "asc" | "desc";

export interface Sort {
  key: string;
  direction: SortDirection;
}

/**
 * The change the Δ column reports: the second compared Group against the
 * first, in percent. `null` for a comparison of one, and where the first Group
 * has no figure to divide by.
 */
function delta(values: Record<string, number | null>, groups: FaceGroup[]): number | null {
  if (groups.length !== 2) return null;
  const first = values[groups[0].id];
  const second = values[groups[1].id];
  if (first === null || first === undefined || second === null || second === undefined) return null;
  return percentChange(first, second);
}

export function measureRows(
  nodes: SimplifiedNode[],
  measured: Map<number, DfgNode>,
  groups: FaceGroup[],
  measures: Measure[]
): MeasureRow[] {
  return nodes
    .filter((node) => node.kind === "activity")
    .map((node) => {
      const measurable: Measurable = {
        counts: node.counts,
        attributes: measured.get(node.id)?.attributes ?? {}
      };
      const cells: Record<string, MeasureCell> = {};
      for (const measure of measures) {
        const values = Object.fromEntries(
          groups.map((group) => [group.id, measureValue(measurable, group.id, measure)])
        );
        cells[measureKey(measure)] = {
          values,
          union: measureUnion(measurable, measure),
          delta: delta(values, groups),
          test: measureTest(measurable, measure)
        };
      }
      return {
        id: node.id,
        label: node.label,
        cells,
        reach: groups
          .filter((group) => (node.counts[group.id]?.cases ?? 0) > 0)
          .map((group) => group.id)
      };
    });
}

/**
 * Ranks the rows by one measure's union, by the size of the difference the Δ
 * column reports, or by name when the sort is on the activity. A row the sort
 * says nothing about goes last either way.
 */
export function sortRows(rows: MeasureRow[], sort: Sort, deltaKey: string): MeasureRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const figure = (row: MeasureRow): number | null => {
    if (sort.key !== DELTA_KEY) return row.cells[sort.key]?.union ?? null;
    const delta = row.cells[deltaKey]?.delta;
    return delta === null || delta === undefined ? null : Math.abs(delta);
  };
  return [...rows].sort((one, other) => {
    if (sort.key === ACTIVITY_KEY) return sign * one.label.localeCompare(other.label);
    const a = figure(one);
    const b = figure(other);
    if (a === null && b === null) return one.label.localeCompare(other.label);
    if (a === null) return 1;
    if (b === null) return -1;
    return sign * (a - b);
  });
}

/** The range a measure covers over the rows, for the ramp legend. */
export function measureRange(rows: MeasureRow[], key: string): [number, number] | null {
  const values = rows
    .map((row) => row.cells[key]?.union ?? null)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}
