import { describe, expect, it } from "vitest";
import type { Rect } from "$lib/dfg/types";
import { prepareRoute } from "$lib/dfg/utils/arrow";
import { placeLabels } from "$lib/dfg/utils/labels";

const crossing = [
  {
    key: "a",
    route: prepareRoute([
      { x: 0, y: 0 },
      { x: 200, y: 200 }
    ]),
    text: "2.4 h"
  },
  {
    key: "b",
    route: prepareRoute([
      { x: 200, y: 0 },
      { x: 0, y: 200 }
    ]),
    text: "3.1 h"
  }
];

describe("placeLabels", () => {
  it("keeps the middle when nothing is in the way", () => {
    const placed = placeLabels([crossing[0]], []);
    expect(placed.get("a")).toEqual({ x: 100, y: 100 });
  });

  it("moves the second of two that would meet at the same point", () => {
    const placed = placeLabels(crossing, []);
    const [one, other] = [placed.get("a")!, placed.get("b")!];
    expect(one).toEqual({ x: 100, y: 100 });
    expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(20);
  });

  it("reads the same way every time", () => {
    expect(placeLabels(crossing, [])).toEqual(placeLabels(crossing, []));
  });

  it("steps off a node it would sit on", () => {
    const node: Rect = { x: 60, y: 80, width: 150, height: 58 };
    const placed = placeLabels([crossing[0]], [node])!;
    const at = placed.get("a")!;
    expect(
      at.x > node.x && at.x < node.x + node.width && at.y > node.y && at.y < node.y + node.height
    ).toBe(false);
  });

  it("pushes a label off its own route when sliding along it cannot part them", () => {
    const parallel = [
      {
        key: "a",
        route: prepareRoute([
          { x: 100, y: 0 },
          { x: 100, y: 200 }
        ]),
        text: "2.4 h"
      },
      {
        key: "b",
        route: prepareRoute([
          { x: 108, y: 0 },
          { x: 108, y: 200 }
        ]),
        text: "3.1 h"
      }
    ];
    const placed = placeLabels(parallel, []);

    expect(placed.get("a")).toEqual({ x: 100, y: 100 });
    // Off its own route, not further down it: two parallel routes have the same
    // stops taken all the way down.
    expect(placed.get("b")!.y).toBe(100);
    expect(Math.abs(placed.get("b")!.x - 108)).toBeGreaterThan(10);
  });

  it("counts the room a label's dots take, not only its text", () => {
    const pair = [
      { ...crossing[0], route: crossing[0].route, text: "0s", extra: 28 },
      {
        key: "b",
        route: prepareRoute([
          { x: 108, y: 0 },
          { x: 108, y: 200 }
        ]),
        text: "0s",
        extra: 28
      }
    ];
    const placed = placeLabels(pair, []);
    const [one, other] = [placed.get("a")!, placed.get("b")!];

    // Two short labels clear each other on text alone; with the dots they do not.
    expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(28);
  });

  it("keeps the middle when no stop is free", () => {
    const wall: Rect[] = [{ x: -500, y: -500, width: 1500, height: 1500 }];
    expect(placeLabels([crossing[0]], wall).get("a")).toEqual({ x: 100, y: 100 });
  });
});
