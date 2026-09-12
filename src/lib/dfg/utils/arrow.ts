/**
 * The drawing of one routed edge: where its shaft stops, the triangle that
 * closes it, and where its label rides. Pure geometry over the points ELK
 * returned, in the same coordinates the nodes are placed in.
 */
import type { Point, Rect } from "$lib/dfg/types";

export interface Arrow {
  shaft: string;
  head: string;
  label: Point;
}

/** Samples per cubic segment. Enough that the polyline reads as the curve. */
const SAMPLES = 18;

/** The gap between the tip and the node it points at. */
const TIP_GAP = 2;

/** How far the head may be pulled back to clear the node it points at. */
const MAX_PULLBACK = 24;

const headLength = (width: number) => 8 + width;
const headHalf = (width: number) => 3 + width * 0.6;

function cubic(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y
  };
}

/**
 * Flattens the `M`/`C` chain into a polyline, so length, tangents and cuts are
 * all one arithmetic.
 */
export function polyline(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]];
  let i = 1;
  while (i + 2 < points.length) {
    const start = out[out.length - 1];
    const [c1, c2, end] = [points[i], points[i + 1], points[i + 2]];
    for (let step = 1; step <= SAMPLES; step++) {
      out.push(cubic(start, c1, c2, end, step / SAMPLES));
    }
    i += 3;
  }
  for (; i < points.length; i++) out.push(points[i]);
  return out;
}

function lengths(line: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    out.push(out[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  }
  return out;
}

/** The point a given distance along the polyline, clamped to both ends. */
function at(line: Point[], run: number[], distance: number): Point {
  const total = run[run.length - 1];
  const want = Math.min(Math.max(distance, 0), total);
  let i = 1;
  while (i < run.length - 1 && run[i] < want) i++;
  const span = run[i] - run[i - 1];
  const t = span === 0 ? 0 : (want - run[i - 1]) / span;
  return {
    x: line[i - 1].x + (line[i].x - line[i - 1].x) * t,
    y: line[i - 1].y + (line[i].y - line[i - 1].y) * t
  };
}

/** The polyline up to a given distance, as path data. */
function cut(line: Point[], run: number[], distance: number): string {
  const kept: Point[] = [line[0]];
  for (let i = 1; i < line.length && run[i] < distance; i++) kept.push(line[i]);
  kept.push(at(line, run, distance));
  return kept.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)},${round(p.y)}`).join("");
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Which way is into the rectangle from a point on its border, or `null` where
 * the point is not on one.
 */
function inward(point: Point, rect: Rect): Point | null {
  const sides = [
    { away: Math.abs(point.x - rect.x), normal: { x: 1, y: 0 } },
    { away: Math.abs(point.x - (rect.x + rect.width)), normal: { x: -1, y: 0 } },
    { away: Math.abs(point.y - rect.y), normal: { x: 0, y: 1 } },
    { away: Math.abs(point.y - (rect.y + rect.height)), normal: { x: 0, y: -1 } }
  ];
  const nearest = sides.reduce((best, side) => (side.away < best.away ? side : best));
  return nearest.away <= 1 ? nearest.normal : null;
}

/**
 * How far back from the border the tip has to sit for the whole triangle to
 * stay outside the node. An edge arriving square needs nothing beyond the gap;
 * one arriving at an angle would otherwise bury a base corner under the box,
 * which is drawn over the edges. Past `MAX_PULLBACK` the edge is running so
 * close to parallel with the border that no head placed on it clears the node.
 */
function pullback(end: Point, direction: Point, rect: Rect | null, width: number): number {
  if (!rect) return TIP_GAP;
  const normal = inward(end, rect);
  if (!normal) return TIP_GAP;
  const into = direction.x * normal.x + direction.y * normal.y;
  if (into <= 0.05) return TIP_GAP;
  const length = headLength(width);
  const half = headHalf(width);
  const side = { x: -direction.y, y: direction.x };
  const depth = (sign: number) =>
    (half * sign * side.x - length * direction.x) * normal.x +
    (half * sign * side.y - length * direction.y) * normal.y;
  return TIP_GAP + Math.min(Math.max(depth(1), depth(-1), 0) / into, MAX_PULLBACK);
}

/**
 * The shaft, the head and the label anchor for one route. `rect` is the box the
 * edge ends at, which the head is kept clear of.
 */
export function arrow(points: Point[], rect: Rect | null, width: number): Arrow {
  const line = polyline(points);
  if (line.length < 2) {
    const only = line[0] ?? { x: 0, y: 0 };
    return { shaft: "", head: "", label: only };
  }

  const run = lengths(line);
  const total = run[run.length - 1];
  const end = line[line.length - 1];
  // Over the last few units, so a short final sample cannot swing the angle.
  const back = at(line, run, total - 4);
  const away = Math.hypot(end.x - back.x, end.y - back.y);
  const direction =
    away === 0 ? { x: 1, y: 0 } : { x: (end.x - back.x) / away, y: (end.y - back.y) / away };

  const length = Math.min(headLength(width), total);
  const gap = Math.min(pullback(end, direction, rect, width), Math.max(total - length, 0));
  const tip = at(line, run, total - gap);
  const base = { x: tip.x - length * direction.x, y: tip.y - length * direction.y };
  const half = headHalf(width);
  const side = { x: -direction.y, y: direction.x };
  const corner = (sign: number) =>
    `${round(base.x + half * sign * side.x)},${round(base.y + half * sign * side.y)}`;

  return {
    shaft: cut(line, run, Math.max(total - gap - length, 0)),
    head: `M${round(tip.x)},${round(tip.y)}L${corner(1)}L${corner(-1)}Z`,
    label: at(line, run, total / 2)
  };
}
