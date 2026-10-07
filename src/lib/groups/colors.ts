/** The Group palette: the dark half of schemePaired, in the order new Groups claim colours. Tokens in `app.css`. */
export const GROUP_COLORS = [
  "group-2",
  "group-4",
  "group-6",
  "group-8",
  "group-10",
  "group-12"
] as const;

/**
 * Each palette colour's hue in OKLCH, for telling a Group's colour apart from
 * anything else drawn beside it. The Original is grey and has none.
 */
export const GROUP_HUES: Record<string, number> = {
  "group-1": 231,
  "group-2": 244,
  "group-3": 131,
  "group-4": 142,
  "group-5": 21,
  "group-6": 28,
  "group-7": 72,
  "group-8": 53,
  "group-9": 314,
  "group-10": 303,
  "group-11": 108,
  "group-12": 47
};

/** The Original's colour. */
export const ORIGINAL_COLOR = "group-original";

/** The colour a Group created at `position` starts with. */
export function defaultColor(position: number): string {
  return GROUP_COLORS[position % GROUP_COLORS.length];
}
