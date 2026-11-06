/**
 * The Significance Tests a drawn graph carries, one per place and attribute,
 * and one per value of a categorical attribute: every block of every activity
 * and every edge on screen that more than one Group reaches. A place one Group
 * alone reaches has nothing to compare against.
 */
import type { Counts, Method, PlaceBlock, ResponseDfg } from "$lib/dfg/invokers/types";
import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
import { edgeId, type LitPath } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { formatDecimal } from "$lib/format";
import { formatPValue } from "$lib/tree/utils/verdict";

export type Place =
  | { kind: "node"; id: number; label: string }
  | { kind: "edge"; source: number; target: number; label: string };

/** `value` names the value a categorical attribute's two-by-two tests, `null` for any other test. */
export interface Finding {
  key: string;
  place: Place;
  attribute: string;
  value: string | null;
  block: PlaceBlock;
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

  const finding = (
    place: Place,
    attribute: string,
    value: string | null,
    block: PlaceBlock
  ): Finding => ({
    key: `${placeKey(place)}:${attribute}${value === null ? "" : `:${value}`}`,
    place,
    attribute,
    value,
    block
  });

  const nodes = simplified.nodes.flatMap((node) => {
    const activity = measured.get(node.id);
    if (!activity || !comparable(activity.counts, groupIds)) return [];
    const place: Place = { kind: "node", id: node.id, label: node.label };
    return [
      ...Object.entries(activity.attributes).map(([attribute, block]) =>
        finding(place, attribute, null, block)
      ),
      ...Object.entries(activity.values).flatMap(([attribute, values]) =>
        Object.entries(values).map(([value, block]) => finding(place, attribute, value, block))
      )
    ];
  });

  const edges = simplified.edges.flatMap((edge) => {
    const blocks = pairs.get(edgeId(edge.source, edge.target));
    if (!blocks || !comparable(edge.counts, groupIds)) return [];
    const place = edgePlace(edge.source, edge.target, labels);
    return Object.entries(blocks).map(([attribute, block]) =>
      finding(place, attribute, null, block)
    );
  });

  return [...nodes, ...correctAcross(edges)];
}

/** The false discovery rate each family is held to. Mirrors `analysis::ALPHA`. */
const ALPHA = 0.05;

/**
 * The Benjamini-Hochberg cutoff of a family: the largest p-value under its
 * rank's share of `alpha`, below zero when none is. Mirrors
 * `analysis::stats::benjamini_hochberg`.
 */
export function benjaminiHochberg(pValues: number[], alpha: number = ALPHA): number {
  const sorted = [...pValues].sort((a, b) => a - b);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] <= ((i + 1) / sorted.length) * alpha) return sorted[i];
  }
  return -1;
}

/**
 * The findings with `significant` set by one Benjamini-Hochberg family per
 * attribute across them. Copies each tested block.
 */
function correctAcross(findings: Finding[]): Finding[] {
  const families = new Map<string, number[]>();
  for (const { attribute, block } of findings) {
    if (block.test)
      families.set(attribute, [...(families.get(attribute) ?? []), block.test.pValue]);
  }
  const cutoffs = new Map(
    [...families].map(([attribute, family]) => [attribute, benjaminiHochberg(family)])
  );
  return findings.map((finding) => {
    const test = finding.block.test;
    if (!test) return finding;
    const significant = test.pValue <= (cutoffs.get(finding.attribute) ?? -1);
    return { ...finding, block: { ...finding.block, test: { ...test, significant } } };
  });
}

/** The category a value's two-by-two counts its hits under. Mirrors `src-tauri/src/dfg/significance.rs`. */
const HELD = "Held";

/** The category a frequency counts its hits under. Mirrors `src-tauri/src/dfg/mod.rs`. */
const HIT: Record<string, string> = {
  [ACTIVITY_FREQUENCY]: "Reached",
  [EDGE_FREQUENCY]: "Followed",
  [REPETITIONS]: "More than once"
};

const VERB: Record<string, string> = {
  [ACTIVITY_FREQUENCY]: "more often",
  [EDGE_FREQUENCY]: "more often",
  [REPETITIONS]: "more often runs it more than once"
};

/**
 * The verdict of a test the DFG words on its own, with the figures in the order
 * the Groups are compared: "Group 2 more often · 72% vs 65%" for a frequency
 * or a value, "Group 1 more often runs it more than once · 42% vs 18%" for
 * Repetitions. `null` for any other attribute or a test that did not come out
 * significant.
 */
export function builtInVerdict(
  finding: Pick<Finding, "attribute" | "value" | "block">,
  groups: { id: string; name: string }[]
): string | null {
  const { attribute, block } = finding;
  if (!block.test?.significant) return null;
  const hit = finding.value === null ? HIT[attribute] : HELD;
  const higher = groups.find((group) => group.id === block.test?.higher);
  if (hit === undefined || !higher) return null;
  const shares = groups.map((group) => {
    const summary = block.summaries[group.id];
    if (summary?.type !== "categorical" || summary.n === 0) return "0%";
    const share = ((summary.counts[hit] ?? 0) / summary.n) * 100;
    return `${share < 10 ? formatDecimal(share, 1) : Math.round(share)}%`;
  });
  const verb = finding.value === null ? VERB[attribute] : "more often";
  return `${higher.name} ${verb} · ${shares.join(" vs ")}`;
}

/**
 * Why a two-by-two carries no test although both Groups have cases: every case
 * of every Group falls in the same category, "Followed in every case of each
 * group". `null` for any other block.
 */
export function unanimous(block: PlaceBlock, groups: { id: string }[]): string | null {
  if (block.test || groups.length < 2) return null;
  const only = groups.map((group) => {
    const summary = block.summaries[group.id];
    if (summary?.type !== "categorical" || summary.n === 0) return null;
    const held = Object.entries(summary.counts).filter(([, count]) => count > 0);
    return held.length === 1 ? held[0][0] : null;
  });
  const [first] = only;
  if (first === null || only.some((category) => category !== first)) return null;
  return `${first} in every case of each group`;
}

const METHOD_NAMES: Record<Method, string> = {
  mannWhitney: "Mann-Whitney U",
  chi2: "Chi-square",
  fisher: "Fisher's exact test"
};

/** The Significance Test in full. The p shown is before the correction across places. */
export function placeTestLine(block: PlaceBlock, groups: { id: string; name: string }[]): string {
  const test = block.test;
  if (!test) return "";
  const name = METHOD_NAMES[block.method ?? (test.test === "chi2" ? "chi2" : "mannWhitney")];
  const effect = test.test === "chi2" ? "phi or Cramér's V" : "rank-biserial r";
  const higher = groups.find((group) => group.id === test.higher);
  const direction = higher && test.significant ? ` · ${higher.name} higher` : "";
  const p = test.pValue === 0 ? "p < 1e-15" : `p = ${formatPValue(test.pValue)}`;
  return `${name} · ${p} before correcting across places · ${effect} ${test.effectSize.toFixed(2)}${direction}`;
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
