/**
 * How dark a node is drawn for the figure it shows: small figures light, large
 * ones dark, in the ramp of the Group colour the node already carries. A
 * step is where a figure sits between the smallest and the largest on screen,
 * from 0 to 1.
 */

export type ShadeScale = "linear" | "log";

/** OKLCH lightness at step 0 and step 1. */
const LIGHTEST = 0.9;
const DARKEST = 0.45;
/** The share of the Group colour's chroma kept at step 0; step 1 keeps all of it. */
const CHROMA_FLOOR = 0.6;
/** The fill's opacity. The ink and the border stay opaque. */
const FILL_ALPHA = 0.9;
/** Below this fill lightness the ink turns light. */
const INK_FLIP = 0.72;
/** The ink's lightness on a light fill and on a dark one. */
const INK_DARK = 0.32;
const INK_LIGHT = 0.92;
/** The share of the fill's chroma the ink keeps on a dark fill; on a light one it keeps all of it. */
const INK_LIGHT_CHROMA = 0.5;

/**
 * Each value's step within the range of the values given. A `null` stays
 * `null` and takes no part in the range. When every value is equal, or only one
 * is present, they all sit at 0.5. `log` spreads on `log1p`, so it expects
 * values of zero or more.
 */
export function shadeSteps(values: (number | null)[], scale: ShadeScale): (number | null)[] {
  const scaled = values.map((value) =>
    value === null ? null : scale === "log" ? Math.log1p(value) : value
  );
  const present = scaled.filter((value): value is number => value !== null);
  if (present.length === 0) return scaled;
  const min = Math.min(...present);
  const max = Math.max(...present);
  return scaled.map((value) => {
    if (value === null) return null;
    return max === min ? 0.5 : (value - min) / (max - min);
  });
}

/** The mean over every case, from per-Group means and their case counts. */
export function pooledMean(parts: { mean: number; n: number }[]): number | null {
  let cases = 0;
  let total = 0;
  for (const part of parts) {
    if (part.n <= 0) continue;
    cases += part.n;
    total += part.mean * part.n;
  }
  return cases === 0 ? null : total / cases;
}

/**
 * CSS colours for a node drawn in the colour token `color` at `step`. `ink` is
 * the text colour, in the fill's own hue: a dark shade of it on a light fill and
 * a light tint of it on a dark one. `null` for a missing step, which keeps the flat tint and leaves
 * each figure in its own Group's colour.
 */
export function shade(
  color: string,
  step: number | null
): { fill: string; border: string; ink: string | null } {
  const base = `var(--${color})`;
  if (step === null) {
    return {
      fill: `color-mix(in oklab, ${base} 8%, var(--card))`,
      border: `color-mix(in oklab, ${base} 45%, var(--card))`,
      ink: null
    };
  }
  const lightness = LIGHTEST - step * (LIGHTEST - DARKEST);
  const chroma = CHROMA_FLOOR + step * (1 - CHROMA_FLOOR);
  const fill = `oklch(from ${base} ${lightness.toFixed(3)} calc(c * ${chroma.toFixed(3)}) h / ${FILL_ALPHA})`;
  return {
    fill,
    border: `oklch(from ${fill} calc(l - 0.12) c h / 1)`,
    ink: `oklch(from ${fill} clamp(${INK_DARK}, calc((${INK_FLIP} - l) * infinity), ${INK_LIGHT}) calc(c * clamp(${INK_LIGHT_CHROMA}, calc((l - ${INK_FLIP}) * infinity), 1)) h / 1)`
  };
}
