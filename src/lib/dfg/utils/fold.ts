/**
 * The variants folded into a graph. Given the activities on screen, every case
 * contributes the pairs its own trace holds once the hidden activities are
 * dropped from it, which is why an edge that appears at a lower detail still
 * carries a count the log measured rather than a stand-in.
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

/** `kept` names the activities to fold over. `null` keeps every one of them. */
export function fold(variants: Variant[], kept: Set<number> | null): Folded {
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
    const trace = kept
      ? variant.activities.filter((activity) => kept.has(activity))
      : variant.activities;
    // A case whose every activity is hidden reaches neither Start nor End: it
    // has nothing left to draw.
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
