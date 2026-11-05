/**
 * The graph a set of Variants draws, folded in the frontend from the rows
 * `list_variants` ships, so the canvas can show it while Rust builds the same
 * graph with its Summaries and Significance Tests. It carries no attribute,
 * no transition and no case-level block.
 *
 * Activities are numbered the way Rust numbers them, by label in sorted order
 * above Start and End, so each keeps its id, and its place, when the built
 * graph replaces this one.
 */
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { END_ID } from "$lib/dfg/types";
import { fold } from "$lib/dfg/utils/fold";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

export function previewGraph(
  rows: ResponseVariantRow[],
  keys: Set<string>,
  groups: string[]
): ResponseDfg {
  const picked = rows.filter((row) => keys.has(row.key));
  const labels = [...new Set(picked.flatMap((row) => row.activities))].sort();
  const ids = new Map(labels.map((label, i) => [label, END_ID + 1 + i]));
  const variants = picked.map((row) => ({
    activities: row.activities.map((label) => ids.get(label) ?? END_ID),
    cases: Object.fromEntries(
      groups.flatMap((group) => ((row.cases[group] ?? 0) > 0 ? [[group, row.cases[group]]] : []))
    )
  }));
  const folded = fold(variants);

  return {
    nodes: labels.map((label) => {
      const id = ids.get(label) ?? END_ID;
      return { id, label, counts: folded.nodes.get(id) ?? {}, attributes: {} };
    }),
    variants,
    transitions: [],
    groups: groups.map((id) => ({
      id,
      caseCount: picked.reduce((sum, row) => sum + (row.cases[id] ?? 0), 0)
    })),
    caseLevel: {}
  };
}
