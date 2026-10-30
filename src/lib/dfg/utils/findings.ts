/**
 * The Significance Tests a drawn graph carries, one per place and attribute:
 * every attribute block of every activity and every edge on screen that more
 * than one Group reaches. A place one Group alone reaches has nothing to
 * compare against.
 */
import type { AttributeBlock } from "$lib/analysis/types";
import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
import { edgeId, type LitPath } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { formatDecimal } from "$lib/format";

export type Place =
  | { kind: "node"; id: number; label: string }
  | { kind: "edge"; source: number; target: number; label: string };

export interface Finding {
  key: string;
  place: Place;
  attribute: string;
  block: AttributeBlock;
}

/** The node ids a place covers, for framing it on the canvas. */
export function placeIds(place: Place): number[] {
  return place.kind === "node" ? [place.id] : [place.source, place.target];
}

/** The canvas ids a place lights: the activity, or the edge and both of its ends. */
export function placeLight(place: Place): LitPath {
  return {
    nodes: new Set(placeIds(place).map(String)),
    edges: new Set(place.kind === "edge" ? [edgeId(place.source, place.target)] : [])
  };
}

/** An edge as a place, named by the labels of its two ends. */
export function edgePlace(source: number, target: number, labels: Map<number, string>): Place {
  return {
    kind: "edge",
    source,
    target,
    label: `${labels.get(source) ?? source} → ${labels.get(target) ?? target}`
  };
}

export function placeKey(place: Place): string {
  return place.kind === "node" ? `n${place.id}` : `e${edgeId(place.source, place.target)}`;
}

/** Whether a place's counts leave something to compare: more than one Group reaches it, or only one Group is compared. */
export function comparable(counts: Record<string, Counts>, groupIds: string[]): boolean {
  return groupIds.length < 2 || groupIds.filter((id) => (counts[id]?.cases ?? 0) > 0).length > 1;
}

export function graphFindings(graph: ResponseDfg, simplified: Simplified): Finding[] {
  const measured = new Map(graph.nodes.map((node) => [node.id, node]));
  const labels = new Map(simplified.nodes.map((node) => [node.id, node.label]));
  const pairs = new Map(
    graph.transitions.map((transition) => [
      edgeId(transition.source, transition.target),
      transition.attributes
    ])
  );
  const groupIds = graph.groups.map((group) => group.id);

  const at = (
    place: Place,
    blocks: Record<string, AttributeBlock>,
    counts: Record<string, Counts>
  ): Finding[] => {
    if (!comparable(counts, groupIds)) return [];
    return Object.entries(blocks).map(([attribute, block]) => ({
      key: `${placeKey(place)}:${attribute}`,
      place,
      attribute,
      block
    }));
  };

  const nodes = simplified.nodes.flatMap((node) => {
    const activity = measured.get(node.id);
    if (!activity) return [];
    return at(
      { kind: "node", id: node.id, label: node.label },
      activity.attributes,
      activity.counts
    );
  });

  const edges = simplified.edges.flatMap((edge) => {
    const blocks = pairs.get(edgeId(edge.source, edge.target));
    if (!blocks) return [];
    return at(edgePlace(edge.source, edge.target, labels), blocks, edge.counts);
  });

  return [...nodes, ...edges];
}

/** The category a frequency counts its hits under. Mirrors `src-tauri/src/dfg/mod.rs`. */
const HIT: Record<string, string> = {
  [ACTIVITY_FREQUENCY]: "Reached",
  [EDGE_FREQUENCY]: "Followed"
};

/**
 * The verdict of a test the DFG runs on its own, in words, with the figures in
 * the order the Groups are compared: "Group 2 more often · 72% vs 65%" for a
 * frequency, "Group 1 repeats it more · 2,1 vs 1,6 times on average" for
 * Repetitions. `null` for any other attribute or a test that did not come out
 * significant.
 */
export function builtInVerdict(
  attribute: string,
  block: AttributeBlock,
  groups: { id: string; name: string }[]
): string | null {
  const higher = groups.find((group) => group.id === block.test?.higher);
  if (!block.test?.significant || !higher) return null;
  const hit = HIT[attribute];
  if (hit !== undefined) {
    const shares = groups.map((group) => {
      const summary = block.summaries[group.id];
      if (summary?.type !== "categorical" || summary.n === 0) return "0%";
      return `${Math.round(((summary.counts[hit] ?? 0) / summary.n) * 100)}%`;
    });
    return `${higher.name} more often · ${shares.join(" vs ")}`;
  }
  if (attribute === REPETITIONS) {
    const means = groups.map((group) => {
      const summary = block.summaries[group.id];
      return summary?.type === "numerical" ? formatDecimal(summary.mean, 1) : "-";
    });
    return `${higher.name} repeats it more · ${means.join(" vs ")} times on average`;
  }
  return null;
}

/** Every place that carries at least one finding, by `placeKey`. */
export function testedPlaces(findings: Finding[]): Set<string> {
  return new Set(findings.map((finding) => placeKey(finding.place)));
}

/** One activity's significant findings, strongest effect first. */
export function activityDifferences(findings: Finding[], id: number): Finding[] {
  return rank(
    findings.filter(
      (finding) =>
        finding.place.kind === "node" && finding.place.id === id && finding.block.test?.significant
    )
  );
}

/** Significant first, then strongest effect. Untested last. */
export function rank(findings: Finding[]): Finding[] {
  const score = (finding: Finding) => finding.block.test?.effectSize ?? -Infinity;
  return [...findings].sort(
    (x, y) =>
      Number(y.block.test?.significant ?? false) - Number(x.block.test?.significant ?? false) ||
      score(y) - score(x)
  );
}

/** How many significant differences an activity carries, and the strongest effect among them. */
export interface NodeDifferences {
  count: number;
  peak: number;
}

/** Each activity's significant findings, by node id. Activities with none are absent. */
export function nodeDifferences(findings: Finding[]): Map<number, NodeDifferences> {
  const out = new Map<number, NodeDifferences>();
  for (const finding of findings) {
    const test = finding.block.test;
    if (finding.place.kind !== "node" || !test?.significant) continue;
    const current = out.get(finding.place.id);
    out.set(finding.place.id, {
      count: (current?.count ?? 0) + 1,
      peak: Math.max(current?.peak ?? 0, test.effectSize)
    });
  }
  return out;
}

export interface AttributeTests {
  attribute: string;
  places: Finding[];
  tested: number;
  significant: number;
  peak: Finding | null;
}

/**
 * Every place that measured an attribute, ranked, with how many of them differ
 * and the strongest one. Attributes that differ in more places come first.
 */
export function byAttribute(findings: Finding[]): AttributeTests[] {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    grouped.set(finding.attribute, [...(grouped.get(finding.attribute) ?? []), finding]);
  }
  return [...grouped.entries()]
    .map(([attribute, all]) => {
      const places = rank(all);
      const differing = rank(all.filter((finding) => finding.block.test?.significant));
      return {
        attribute,
        places,
        tested: all.filter((finding) => finding.block.test).length,
        significant: differing.length,
        peak: differing[0] ?? null
      };
    })
    .sort(
      (x, y) =>
        y.significant - x.significant ||
        (y.peak?.block.test?.effectSize ?? 0) - (x.peak?.block.test?.effectSize ?? 0)
    );
}
