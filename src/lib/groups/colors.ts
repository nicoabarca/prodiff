/**
 * The Group palette. Every colour the interface paints a Group with comes from
 * here — a component never writes a colour into a class or a style attribute,
 * so changing a hue is a change to `app.css` and this list, nowhere else.
 *
 * The order is the order new Groups claim colours in. It runs out long before
 * a project realistically does, and wrapping is deliberate: a repeated hue is
 * better than an unreadable one, and the user can always pick another.
 */
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

/**
 * The Original is context rather than an identity, so it reads grey next to
 * the accents and is not offered as a choice.
 */
export const ORIGINAL_COLOR = "group-original";

/** The colour a Group created at `position` starts with. */
export function defaultColor(position: number): string {
  return GROUP_COLORS[position % GROUP_COLORS.length];
}
