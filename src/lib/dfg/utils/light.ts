/**
 * Which of the things asking to light part of the canvas wins. Only one is
 * drawn at a time, and the order is fixed: a Variant lit from the Variants
 * panel, then the place the tests panel points at, then the one under the
 * pointer.
 */
import type { LitPath } from "$lib/dfg/utils/fold";

export type LightSource = "variant" | "finding" | "hover";

export const LIGHT_PRIORITY: readonly LightSource[] = ["variant", "finding", "hover"];

/** The highest-priority source that lights anything, or `null` when none does. */
export function light(sources: Partial<Record<LightSource, LitPath | null>>): LitPath | null {
  for (const source of LIGHT_PRIORITY) {
    const lit = sources[source];
    if (lit) return lit;
  }
  return null;
}
