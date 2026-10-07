/**
 * How dark a node is drawn for the figure it shows: small figures light, large
 * ones dark, in the ramp of the Group colour the node already carries. A
 * step is where a figure sits between the smallest and the largest on screen,
 * from 0 to 1.
 */

import { GROUP_HUES } from "$lib/groups/colors";

export type ShadeScale = "linear" | "log";

/**
 * The hue a shade is read in. `group` takes it from the Group the node belongs
 * to, so the shade and the membership are one colour. A node that belongs to one
 * Group reads `group` whatever is chosen, so no ramp can be mistaken for a
 * Group's own colour.
 */
export type Ramp =
  "group" | "blue" | "teal" | "green" | "amber" | "orange" | "red" | "pink" | "violet" | "grey";

export const RAMPS: Ramp[] = [
  "group",
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "pink",
  "violet",
  "grey"
];

/** What the user reads for a ramp. */
export const RAMP_LABELS: Record<Ramp, string> = {
  group: "Group colour",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  red: "Red",
  pink: "Pink",
  violet: "Violet",
  grey: "Grey"
};

/** Each fixed ramp's hue in OKLCH. Grey has no chroma, so it has no hue to clash. */
const RAMP_HUES: Record<Exclude<Ramp, "group" | "grey">, number> = {
  blue: 258,
  teal: 195,
  green: 145,
  amber: 85,
  orange: 50,
  red: 25,
  pink: 350,
  violet: 290
};

/** How near a Group's hue a ramp may come before the two read as one colour. */
const HUE_CLEARANCE = 50;

function hueApart(one: number, other: number): number {
  const gap = Math.abs(one - other) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/**
 * The ramps that cannot be mistaken for any of the Group colours given. A node
 * that belongs to one Group already keeps that Group's colour, so a ramp in the
 * same hue would make the shade of a shared activity read as membership.
 */
export function rampsFor(colors: string[]): Ramp[] {
  const hues = colors.map((color) => GROUP_HUES[color]).filter((hue) => hue !== undefined);
  return RAMPS.filter((ramp) => {
    const hue = RAMP_HUES[ramp as keyof typeof RAMP_HUES];
    return hue === undefined || hues.every((taken) => hueApart(hue, taken) >= HUE_CLEARANCE);
  });
}

/** A ramp a Group's colour has since claimed falls back to the Group ramp. */
export function keptRamp(ramp: Ramp, available: Ramp[]): Ramp {
  return available.includes(ramp) ? ramp : "group";
}

/** The colour each fixed ramp is built from. `group` has none: it reads the node's own. */
const RAMP_BASE: Record<Exclude<Ramp, "group">, string> = {
  blue: "oklch(0.55 0.21 258)",
  teal: "oklch(0.58 0.12 195)",
  green: "oklch(0.56 0.16 145)",
  amber: "oklch(0.70 0.16 85)",
  orange: "oklch(0.64 0.19 50)",
  red: "oklch(0.56 0.22 25)",
  pink: "oklch(0.60 0.22 350)",
  violet: "oklch(0.52 0.24 290)",
  grey: "oklch(0.55 0.01 85)"
};

/** OKLCH lightness at step 0 and step 1. */
const LIGHTEST = 0.9;
const DARKEST = 0.45;
/** The share of the ramp colour's chroma kept at step 0; step 1 keeps all of it. */
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
  step: number | null,
  ramp: Ramp = "group"
): { fill: string; border: string; ink: string | null } {
  // A node with no figure keeps its Group's own tint whatever the ramp is:
  // there is nothing to read on the ramp, and the Group is still worth seeing.
  if (step === null) {
    const own = `var(--${color})`;
    return {
      fill: `color-mix(in oklab, ${own} 8%, var(--card))`,
      border: `color-mix(in oklab, ${own} 45%, var(--card))`,
      ink: null
    };
  }
  const base = ramp === "group" ? `var(--${color})` : RAMP_BASE[ramp];
  const lightness = LIGHTEST - step * (LIGHTEST - DARKEST);
  const chroma = CHROMA_FLOOR + step * (1 - CHROMA_FLOOR);
  const fill = `oklch(from ${base} ${lightness.toFixed(3)} calc(c * ${chroma.toFixed(3)}) h / ${FILL_ALPHA})`;
  return {
    fill,
    border: `oklch(from ${fill} calc(l - 0.12) c h / 1)`,
    ink: `oklch(from ${fill} clamp(${INK_DARK}, calc((${INK_FLIP} - l) * infinity), ${INK_LIGHT}) calc(c * clamp(${INK_LIGHT_CHROMA}, calc((l - ${INK_FLIP}) * infinity), 1)) h / 1)`
  };
}
