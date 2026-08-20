import type { AttributeBlock, TreeNode } from "$lib/tree/invokers/types";
import type { EffectBand, Standing } from "$lib/tree/types";
import { TRANSITION_TIME } from "$lib/tree/utils/settings";

/** True when any attribute at this node came out significant. */
export function hasSignificant(node: TreeNode): boolean {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  return blocks.some((block) => block?.test?.significant);
}

/**
 * Cohen's conventional r bands. They apply unchanged to the rank-biserial
 * correlation Mann-Whitney ships and to Cramér's V at one degree of freedom,
 * which two Groups always give — so one legend covers both tests.
 */
export function effectBand(effectSize: number): EffectBand {
  if (effectSize < 0.1) return "negligible";
  if (effectSize < 0.3) return "small";
  if (effectSize < 0.5) return "moderate";
  return "large";
}

/** The band's step on the `--effect-*` ramp, 1 (negligible) to 4 (large). */
export function effectStep(effectSize: number): 1 | 2 | 3 | 4 {
  return { negligible: 1, small: 2, moderate: 3, large: 4 }[effectBand(effectSize)] as 1 | 2 | 3 | 4;
}

export function standing(block: AttributeBlock): Standing {
  if (!block.test) return "untested";
  return block.test.significant ? "finding" : "weak";
}

/**
 * The strongest effect among the significant tests at a node, or `null` when
 * none passed. This is what the node's badge is coloured by: the count alone
 * says how many differences are here, never whether any of them matter.
 */
export function peakEffect(node: TreeNode): number | null {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  const effects = blocks
    .filter((block) => block?.test?.significant)
    .map((block) => block!.test!.effectSize);
  return effects.length > 0 ? Math.max(...effects) : null;
}

/**
 * Every attribute at a node — Transition Time last, as the edge into it —
 * ordered strongest first and split by Standing, which is the order the detail
 * panel reads in. Untested blocks sort below every tested one.
 */
export function rankedBlocks(node: TreeNode): Record<Standing, [string, AttributeBlock][]> {
  const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
  if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
  entries.sort((x, y) => (y[1].test?.effectSize ?? -1) - (x[1].test?.effectSize ?? -1));
  const of = (which: Standing) => entries.filter(([, block]) => standing(block) === which);
  return { finding: of("finding"), weak: of("weak"), untested: of("untested") };
}
