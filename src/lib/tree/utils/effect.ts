import type { AttributeBlock } from "$lib/analysis/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import type { EffectBand, Standing } from "$lib/tree/types";

/** True when any of the node's own attributes came out significant. */
export function hasSignificant(node: TreeNode): boolean {
  return Object.values(node.eventLevel).some((block) => block.test?.significant);
}

/**
 * The effect size of the Transition Time test on the edge into this node, or
 * `null` unless that test came out significant.
 */
export function edgeEffect(node: TreeNode): number | null {
  const test = node.transitionTime?.test;
  return test?.significant ? test.effectSize : null;
}

/**
 * Cohen's conventional r bands. They apply unchanged to Mann-Whitney's
 * rank-biserial correlation and to Cramér's V at one degree of freedom.
 */
export function effectBand(effectSize: number): EffectBand {
  if (effectSize < 0.1) return "negligible";
  if (effectSize < 0.3) return "small";
  if (effectSize < 0.5) return "moderate";
  return "large";
}

/** The band's step on the `--effect-*` ramp, 1 (negligible) to 4 (large). */
export function effectStep(effectSize: number): 1 | 2 | 3 | 4 {
  return { negligible: 1, small: 2, moderate: 3, large: 4 }[effectBand(effectSize)] as
    1 | 2 | 3 | 4;
}

export function standing(block: AttributeBlock): Standing {
  if (!block.test) return "untested";
  return block.test.significant ? "finding" : "weak";
}

/**
 * The strongest effect among the significant tests of a node's own attributes,
 * or `null` when none passed. Colours the node's badge.
 */
export function peakEffect(node: TreeNode): number | null {
  const effects = Object.values(node.eventLevel)
    .filter((block) => block.test?.significant)
    .map((block) => block.test!.effectSize);
  return effects.length > 0 ? Math.max(...effects) : null;
}

/**
 * Every attribute of a node, ordered strongest first and split by Standing.
 * Untested blocks sort last.
 */
export function rankedBlocks(node: TreeNode): Record<Standing, [string, AttributeBlock][]> {
  const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
  entries.sort((x, y) => (y[1].test?.effectSize ?? -1) - (x[1].test?.effectSize ?? -1));
  const of = (which: Standing) => entries.filter(([, block]) => standing(block) === which);
  return { finding: of("finding"), weak: of("weak"), untested: of("untested") };
}
