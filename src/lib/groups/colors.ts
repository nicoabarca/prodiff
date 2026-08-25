/** The Group palette, in the order new Groups claim colours. Tokens defined in `app.css`. */
export const GROUP_COLORS = [
  "group-1",
  "group-2",
  "group-3",
  "group-4",
  "group-5",
  "group-6",
  "group-7",
  "group-8"
] as const;

/** The Original's colour. Not offered as a choice. */
export const ORIGINAL_COLOR = "group-original";

/** The colour a Group created at `position` starts with. */
export function defaultColor(position: number): string {
  return GROUP_COLORS[position % GROUP_COLORS.length];
}
