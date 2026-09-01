import type { AttributeBlock } from "$lib/analysis/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import type { EffectBand, Standing } from "$lib/tree/types";
import { TRANSITION_TIME } from "$lib/tree/utils/settings";

/** True when any attribute at this node came out significant. */
export function hasSignificant(node: TreeNode): boolean {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  return blocks.some((block) => block?.test?.significant);
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
 * The strongest effect among the significant tests at a node, or `null` when
 * none passed. Colours the node's badge.
 */
export function peakEffect(node: TreeNode): number | null {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  const effects = blocks
    .filter((block) => block?.test?.significant)
    .map((block) => block!.test!.effectSize);
  return effects.length > 0 ? Math.max(...effects) : null;
}

/**
 * Every attribute at a node, Transition Time last, ordered strongest first and
 * split by Standing. Untested blocks sort last.
 */
export function rankedBlocks(node: TreeNode): Record<Standing, [string, AttributeBlock][]> {
  const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
  if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
  entries.sort((x, y) => (y[1].test?.effectSize ?? -1) - (x[1].test?.effectSize ?? -1));
  const of = (which: Standing) => entries.filter(([, block]) => standing(block) === which);
  return { finding: of("finding"), weak: of("weak"), untested: of("untested") };
}
