/**
 * The Significance Tests a drawn graph carries, flattened into one list: every
 * attribute block of every activity on screen, plus the Waiting Time of every
 * edge on screen whose pair the log holds.
 */
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { AttributeBlock } from "$lib/analysis/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { edgeId } from "$lib/dfg/utils/fold";
import { transitionsById } from "$lib/dfg/utils/face";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { standing } from "$lib/tree/utils/effect";
import type { Standing } from "$lib/tree/types";

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

/** The node ids a place covers, for framing and lighting it on the canvas. */
export function placeIds(place: Place): number[] {
  return place.kind === "node" ? [place.id] : [place.source, place.target];
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
    return [{ key: `${placeKey(place)}:${TRANSITION_TIME}`, place, attribute: TRANSITION_TIME, block }];
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

export function split(findings: Finding[]): Record<Standing, Finding[]> {
  const ordered = rank(findings, "effect");
  const of = (which: Standing) => ordered.filter((finding) => standing(finding.block) === which);
  return { finding: of("finding"), weak: of("weak"), untested: of("untested") };
}

export interface AttributeSpread {
  attribute: string;
  tested: number;
  significant: number;
  peak: Finding | null;
}

/** Per attribute, how many of the places that test it differ, and the strongest one. */
export function spread(findings: Finding[]): AttributeSpread[] {
  const by = new Map<string, Finding[]>();
  for (const finding of findings) {
    by.set(finding.attribute, [...(by.get(finding.attribute) ?? []), finding]);
  }
  return [...by.entries()]
    .map(([attribute, all]) => {
      const significant = rank(
        all.filter((finding) => finding.block.test?.significant),
        "effect"
      );
      return {
        attribute,
        tested: all.filter((finding) => finding.block.test).length,
        significant: significant.length,
        peak: significant[0] ?? null
      };
    })
    .sort(
      (x, y) =>
        y.significant - x.significant ||
        (y.peak?.block.test?.effectSize ?? 0) - (x.peak?.block.test?.effectSize ?? 0)
    );
}

/** The findings at one node: its own attributes, then the Waiting Time on the edges into and out of it. */
export function atNode(findings: Finding[], id: number) {
  return {
    own: findings.filter((f) => f.place.kind === "node" && f.place.id === id),
    into: findings.filter((f) => f.place.kind === "edge" && f.place.target === id),
    outOf: findings.filter((f) => f.place.kind === "edge" && f.place.source === id)
  };
}
