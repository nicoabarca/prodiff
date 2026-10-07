/**
 * Where each edge label rides. Two edges that cross meet at their middles, so
 * the obvious anchor puts one pill on top of another and neither reads.
 */
import type { Point, Rect } from "$lib/dfg/types";
import { along, type Route } from "$lib/dfg/utils/arrow";

/** `extra` is room the pill needs beyond its text, such as the Groups' dots. */
export interface Labelled {
  key: string;
  route: Route;
  text: string;
  extra?: number;
}

/**
 * Fractions of the route to try, middle first. Past these the label is far
 * enough from the middle to read as another edge's.
 */
const STOPS = [0.5, 0.58, 0.42, 0.66, 0.34, 0.74, 0.26, 0.82, 0.18];

/**
 * How far a label may be pushed off its own route when no stop along it is free,
 * in multiples of its own width: two edges that run side by side have the same
 * stops free or taken all the way down, so sliding along never parts them, and a
 * push shorter than the label cannot part them either.
 */
const PUSHES = [0, 1, -1, 2, -2];

/** The pill is 0.625rem text in a rounded box; near enough for a hit test. */
const CHAR_WIDTH = 5.6;
const PADDING = 14;
const HEIGHT = 16;
const CLEARANCE = 3;

/** The unit normal to the route at a stop, for pushing a label off it. */
function normalAt(route: Route, stop: number): Point {
  const before = along(route, Math.max(0, stop - 0.01));
  const after = along(route, Math.min(1, stop + 0.01));
  const run = { x: after.x - before.x, y: after.y - before.y };
  const length = Math.hypot(run.x, run.y) || 1;
  return { x: -run.y / length, y: run.x / length };
}

function box(at: Point, text: string, extra = 0): Rect {
  const width = text.length * CHAR_WIDTH + PADDING + extra;
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

/** How long a route is, which is how much room its label has to move in. */
const span = (edge: Labelled) => edge.route.distances[edge.route.distances.length - 1] ?? 0;

/**
 * Anchors every label, taking the first candidate that clears the nodes and the
 * labels already placed: each stop along the route first, then the same stops
 * pushed off it to either side. A label with nowhere to go keeps the middle.
 *
 * The shortest routes are placed first, because they have the fewest stops that
 * clear anything; ties go by key, so the same graph always reads the same way.
 */
export function placeLabels(edges: Labelled[], nodes: Rect[]): Map<string, Point> {
  const taken: Rect[] = [];
  const placed = new Map<string, Point>();

  const ordered = [...edges].sort(
    (one, other) => span(one) - span(other) || one.key.localeCompare(other.key)
  );

  for (const edge of ordered) {
    const reach = box({ x: 0, y: 0 }, edge.text, edge.extra).width * 0.8 + CLEARANCE * 3;
    const tried = STOPS.flatMap((stop) => {
      const base = along(edge.route, stop);
      const normal = normalAt(edge.route, stop);
      return PUSHES.map((push) => ({
        x: base.x + normal.x * push * reach,
        y: base.y + normal.y * push * reach
      }));
    });
    const free = tried.find((point) => {
      const shape = box(point, edge.text, edge.extra);
      return (
        !nodes.some((node) => overlaps(shape, node)) &&
        !taken.some((other) => overlaps(shape, other))
      );
    });
    const anchor = free ?? tried[0];
    taken.push(box(anchor, edge.text, edge.extra));
    placed.set(edge.key, anchor);
  }

  return placed;
}
