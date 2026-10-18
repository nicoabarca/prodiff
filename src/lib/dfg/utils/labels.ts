/**
 * The box an edge label takes: one line per Group, stacked, in 0.625rem
 * monospace. ELK lays these boxes out with the graph, so a label sits on its
 * own edge and never on a node or on another label. Sizes are in the CSS
 * pixels ELK and Svelte Flow both work in.
 */
import type { Point, Rect } from "$lib/dfg/types";
import type { EdgeWait } from "$lib/tree/utils/flow";

export interface Size {
  width: number;
  height: number;
}

const CHAR_WIDTH = 6.1;
const LINE_HEIGHT = 13;
const PADDING_X = 8;
const PADDING_Y = 4;
const DOT = 10;

/**
 * The box a stack of waits needs, or null when there is nothing to print.
 * `dotted` is whether each line carries its Group's dot.
 */
export function labelSize(waits: EdgeWait[], dotted: boolean): Size | null {
  if (waits.length === 0) return null;
  const longest = Math.max(...waits.map((wait) => wait.value.length));
  const dot = dotted ? DOT : 0;
  return {
    width: Math.ceil(longest * CHAR_WIDTH + dot + PADDING_X),
    height: waits.length * LINE_HEIGHT + PADDING_Y
  };
}

/**
 * Fractions of a route a label may slide to, middle first, when the spot
 * beside its reserved room is taken. Past these it reads as another edge's.
 */
export const LABEL_STOPS = [0.5, 0.4, 0.6, 0.3, 0.7];

/** A label to settle: `onLine` are spots on its edge's line, best first, and
    `reserved` the room ELK kept free beside the edge. */
export interface Settling {
  key: string;
  size: Size;
  onLine: Point[];
  reserved: Point;
}

const boxAt = (at: Point, size: Size): Rect => ({
  x: at.x - size.width / 2,
  y: at.y - size.height / 2,
  ...size
});

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/**
 * Where each label is drawn: at the first spot on its edge's line that covers
 * no node, no other label's reserved room and no label already settled, or
 * else in the room ELK reserved beside the edge. Reserved rooms never overlap
 * one another or a node, so no choice lands on another label.
 */
export function settleLabels(labels: Settling[], nodes: Rect[]): Map<string, Point> {
  const reserved = labels.map((label) => ({
    key: label.key,
    box: boxAt(label.reserved, label.size)
  }));
  const taken: Rect[] = [];
  const settled = new Map<string, Point>();
  for (const label of labels) {
    const clear = (at: Point) => {
      const box = boxAt(at, label.size);
      return (
        !nodes.some((node) => overlaps(box, node)) &&
        !reserved.some((other) => other.key !== label.key && overlaps(box, other.box)) &&
        !taken.some((other) => overlaps(box, other))
      );
    };
    const at = label.onLine.find(clear) ?? label.reserved;
    taken.push(boxAt(at, label.size));
    settled.set(label.key, at);
  }
  return settled;
}
