/**
 * The light tint a node is drawn in, in the colour of the Group it belongs to
 * or the Original's grey. Every node of a colour reads the same, whatever its
 * figures.
 */

/** CSS colours for a node drawn in the colour token `color`. */
export function shade(color: string): { fill: string; border: string } {
  const base = `var(--${color})`;
  return {
    fill: `color-mix(in oklab, ${base} 8%, var(--card))`,
    border: `color-mix(in oklab, ${base} 45%, var(--card))`
  };
}
