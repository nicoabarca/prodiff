import { describe, expect, it } from "vitest";
import type { Point, Rect } from "$lib/dfg/types";
import { arrow, polyline } from "$lib/dfg/utils/arrow";

const node: Rect = { x: 100, y: 200, width: 150, height: 58 };

/** The three corners of a head path, so the geometry can be asserted on. */
function corners(head: string): Point[] {
  return [...head.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2])
  }));
}

function inside(point: Point, rect: Rect): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

function ends(shaft: string): Point {
  const points = corners(shaft);
  return points[points.length - 1];
}

describe("polyline", () => {
  it("keeps a line of points as it is", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ];
    expect(polyline(points)).toEqual(points);
  });

  it("samples a cubic between its ends", () => {
    const line = polyline([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 }
    ]);
    expect(line.length).toBeGreaterThan(4);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it("has nothing to draw without points", () => {
    expect(polyline([])).toEqual([]);
  });
});

describe("arrow", () => {
  it("points at the border it was routed to", () => {
    const drawn = arrow(
      [
        { x: 175, y: 100 },
        { x: 175, y: 200 }
      ],
      node,
      2
    );
    const [tip] = corners(drawn.head);
    expect(tip.x).toBeCloseTo(175);
    expect(tip.y).toBeGreaterThan(190);
    expect(tip.y).toBeLessThan(200);
  });

  it("keeps the whole head clear of the node, square on and at an angle", () => {
    const arrivals: [Point, Point][] = [
      [
        { x: 175, y: 100 },
        { x: 175, y: 200 }
      ],
      [
        { x: 75, y: 100 },
        { x: 175, y: 200 }
      ],
      [
        { x: 2, y: 100 },
        { x: 175, y: 200 }
      ],
      [
        { x: 348, y: 120 },
        { x: 175, y: 200 }
      ],
      [
        { x: 0, y: 229 },
        { x: 100, y: 229 }
      ],
      [
        { x: 175, y: 358 },
        { x: 175, y: 258 }
      ]
    ];
    for (const [start, end] of arrivals) {
      const drawn = arrow([start, end], node, 8);
      for (const point of corners(drawn.head)) expect(inside(point, node)).toBe(false);
    }
  });

  it("stops the shaft where the head begins", () => {
    const drawn = arrow(
      [
        { x: 175, y: 100 },
        { x: 175, y: 200 }
      ],
      node,
      4
    );
    const [, left, right] = corners(drawn.head);
    const base = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const stop = ends(drawn.shaft);
    expect(Math.hypot(stop.x - base.x, stop.y - base.y)).toBeLessThan(0.5);
  });

  it("rides the label at the middle of the route", () => {
    const drawn = arrow(
      [
        { x: 175, y: 100 },
        { x: 175, y: 200 }
      ],
      node,
      2
    );
    expect(drawn.label).toEqual({ x: 175, y: 150 });
  });

  it("draws nothing for a route with no points", () => {
    expect(arrow([], node, 2)).toEqual({ shaft: "", head: "", label: { x: 0, y: 0 } });
  });
});
