/**
 * Where each edge label rides. Two edges that cross meet at their middles, so
 * the obvious anchor puts one pill on top of another and neither reads.
 */
import type { Point, Rect } from "$lib/dfg/types";
import { along } from "$lib/dfg/utils/arrow";

export interface Labelled {
  key: string;
  points: Point[];
  text: string;
}

/**
 * Fractions of the route to try, middle first. Past these the label is far
 * enough from the middle to read as another edge's.
 */
const STOPS = [0.5, 0.58, 0.42, 0.66, 0.34, 0.74, 0.26];

/** The pill is 0.625rem text in a rounded box; near enough for a hit test. */
const CHAR_WIDTH = 5.6;
const PADDING = 14;
const HEIGHT = 16;
const CLEARANCE = 3;

function box(at: Point, text: string): Rect {
  const width = text.length * CHAR_WIDTH + PADDING;
  return { x: at.x - width / 2, y: at.y - HEIGHT / 2, width, height: HEIGHT };
}

function overlaps(one: Rect, other: Rect): boolean {
  return (
    one.x < other.x + other.width + CLEARANCE &&
    other.x < one.x + one.width + CLEARANCE &&
    one.y < other.y + other.height + CLEARANCE &&
    other.y < one.y + one.height + CLEARANCE
  );
}

/**
 * Anchors every label, taking the first stop along its route that clears the
 * nodes and the labels already placed. A label with nowhere to go keeps the
 * middle. The order the edges arrive in decides who moves, so the same graph
 * always reads the same way.
 */
export function placeLabels(edges: Labelled[], nodes: Rect[]): Map<string, Point> {
  const taken: Rect[] = [];
  const placed = new Map<string, Point>();

  for (const edge of edges) {
    const tried = STOPS.map((stop) => along(edge.points, stop));
    const free = tried.find((point) => {
      const shape = box(point, edge.text);
      return (
        !nodes.some((node) => overlaps(shape, node)) &&
        !taken.some((other) => overlaps(shape, other))
      );
    });
    const anchor = free ?? tried[0];
    taken.push(box(anchor, edge.text));
    placed.set(edge.key, anchor);
  }

  return placed;
}
