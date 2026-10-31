/**
 * The Significance Tests a drawn graph carries, one per place and attribute:
 * every attribute block of every activity on screen, plus the Waiting Time of
 * every edge on screen whose pair the log holds.
 */
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { AttributeBlock } from "$lib/analysis/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { edgeId, type LitPath } from "$lib/dfg/utils/fold";
import { transitionsById } from "$lib/dfg/utils/face";
import type { Simplified } from "$lib/dfg/utils/simplify";

export type Place =
  | { kind: "node"; id: number; label: string }
  | { kind: "edge"; source: number; target: number; label: string };

export interface Finding {
  key: string;
  place: Place;
  attribute: string;
  block: AttributeBlock;
}

export type Ranking = "effect" | "pValue";

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

export function placeKey(place: Place): string {
  return place.kind === "node" ? `n${place.id}` : `e${edgeId(place.source, place.target)}`;
}

export function graphFindings(graph: ResponseDfg, simplified: Simplified): Finding[] {
  const measured = new Map(graph.nodes.map((node) => [node.id, node]));
  const labels = new Map(simplified.nodes.map((node) => [node.id, node.label]));
  const waits = transitionsById(graph);

  const nodes = simplified.nodes.flatMap((node) => {
    const blocks = measured.get(node.id)?.attributes ?? {};
    const place: Place = { kind: "node", id: node.id, label: node.label };
    return Object.entries(blocks).map(([attribute, block]) => ({
      key: `${placeKey(place)}:${attribute}`,
      place,
      attribute,
      block
    }));
  });

  const edges = simplified.edges.flatMap((edge) => {
    const block = waits.get(edgeId(edge.source, edge.target));
    if (!block) return [];
    const place: Place = {
      kind: "edge",
      source: edge.source,
      target: edge.target,
      label: `${labels.get(edge.source) ?? edge.source} → ${labels.get(edge.target) ?? edge.target}`
    };
    return [
      { key: `${placeKey(place)}:${TRANSITION_TIME}`, place, attribute: TRANSITION_TIME, block }
    ];
  });

  return [...nodes, ...edges];
}

/** Significant first, then strongest effect or smallest p. Untested last. */
export function rank(findings: Finding[], by: Ranking): Finding[] {
  const score = (finding: Finding) => {
    const test = finding.block.test;
    if (!test) return -Infinity;
    return by === "effect" ? test.effectSize : -test.pValue;
  };
  return [...findings].sort(
    (x, y) =>
      Number(y.block.test?.significant ?? false) - Number(x.block.test?.significant ?? false) ||
      score(y) - score(x)
  );
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
export function byAttribute(findings: Finding[], by: Ranking): AttributeTests[] {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    grouped.set(finding.attribute, [...(grouped.get(finding.attribute) ?? []), finding]);
  }
  return [...grouped.entries()]
    .map(([attribute, all]) => {
      const places = rank(all, by);
      const differing = rank(
        all.filter((finding) => finding.block.test?.significant),
        "effect"
      );
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
