/**
 * The variants folded into a graph: every case contributes the pairs its own
 * trace holds, in the order it holds them, so every edge here happened.
 *
 * `cases` counts a case once however many times it ran the pair; `events`
 * counts every occurrence.
 */
import type { Counts, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type Measure } from "$lib/dfg/types";

export interface FoldedEdge {
  source: number;
  target: number;
  counts: Record<string, Counts>;
}

export interface Folded {
  nodes: Map<number, Record<string, Counts>>;
  edges: FoldedEdge[];
}

export const edgeId = (source: number, target: number) => `${source}->${target}`;

/** Joins a Variant's activity labels the same way `list_variants` keys them,
    so a picker key can be matched against a graph Variant. */
export function variantKey(activities: number[], labels: Map<number, string>): string {
  return activities.map((id) => labels.get(id) ?? String(id)).join("\u{1}");
}

/** The edges one Variant's trace draws, Start through End, for highlighting. */
export function variantEdgeIds(activities: number[]): Set<string> {
  if (activities.length === 0) return new Set();
  const ids = new Set<string>();
  ids.add(edgeId(START_ID, activities[0]));
  for (let i = 0; i + 1 < activities.length; i++) {
    ids.add(edgeId(activities[i], activities[i + 1]));
  }
  ids.add(edgeId(activities[activities.length - 1], END_ID));
  return ids;
}

/** The union across the Groups, which is what everything ranks and scales by. */
export function unionCount(counts: Record<string, Counts>, measure: Measure): number {
  let total = 0;
  for (const count of Object.values(counts)) total += count[measure];
  return total;
}

function add(into: Record<string, Counts>, group: string, cases: number, events: number) {
  const found = into[group] ?? (into[group] = { cases: 0, events: 0 });
  found.cases += cases;
  found.events += events;
}

export function fold(variants: Variant[]): Folded {
  const nodes = new Map<number, Record<string, Counts>>();
  const edges = new Map<string, FoldedEdge>();

  const nodeCounts = (id: number) => {
    const found = nodes.get(id);
    if (found) return found;
    const fresh: Record<string, Counts> = {};
    nodes.set(id, fresh);
    return fresh;
  };
  const edgeCounts = (source: number, target: number) => {
    const key = edgeId(source, target);
    const found = edges.get(key);
    if (found) return found.counts;
    const fresh: FoldedEdge = { source, target, counts: {} };
    edges.set(key, fresh);
    return fresh.counts;
  };

  for (const variant of variants) {
    const trace = variant.activities;
    if (trace.length === 0) continue;

    const nodeHits = new Map<number, number>();
    for (const activity of trace) nodeHits.set(activity, (nodeHits.get(activity) ?? 0) + 1);

    const edgeHits = new Map<string, number>();
    const pairs: [number, number][] = [[START_ID, trace[0]]];
    for (let i = 0; i + 1 < trace.length; i++) pairs.push([trace[i], trace[i + 1]]);
    pairs.push([trace[trace.length - 1], END_ID]);
    for (const [source, target] of pairs) {
      const key = edgeId(source, target);
      edgeHits.set(key, (edgeHits.get(key) ?? 0) + 1);
    }

    for (const [group, cases] of Object.entries(variant.cases)) {
      // A case enters once and leaves once, so the two boundaries count it once
      // on both measures.
      add(nodeCounts(START_ID), group, cases, cases);
      add(nodeCounts(END_ID), group, cases, cases);
      for (const [activity, times] of nodeHits) {
        add(nodeCounts(activity), group, cases, cases * times);
      }
      for (const [key, times] of edgeHits) {
        const [source, target] = key.split("->").map(Number);
        add(edgeCounts(source, target), group, cases, cases * times);
      }
    }
  }

  const ordered = [...edges.values()].sort((a, b) => a.source - b.source || a.target - b.target);
  return { nodes, edges: ordered };
}
