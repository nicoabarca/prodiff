import { describe, expect, it } from "vitest";
import type { Rect } from "$lib/dfg/types";
import { straightRoute } from "$lib/dfg/utils/layout";

const source: Rect = { x: 10, y: 20, width: 150, height: 58 };
const target: Rect = { x: 210, y: 160, width: 150, height: 58 };

describe("straightRoute", () => {
  it("connects the same handles as a top-down node", () => {
    expect(straightRoute(source, target, "TB")).toEqual([
      { x: 85, y: 78 },
      { x: 285, y: 160 }
    ]);
  });

  it("connects the same handles as a left-to-right node", () => {
    expect(straightRoute(source, target, "LR")).toEqual([
      { x: 160, y: 49 },
      { x: 210, y: 189 }
    ]);
  });

  it("leaves an edge absent only when one endpoint is absent", () => {
    expect(straightRoute(source, null, "TB")).toEqual([]);
  });
});
