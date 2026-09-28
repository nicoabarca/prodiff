import { describe, expect, it } from "vitest";
import { frame, MAX_SIDE, PADDING, validSide } from "./frame";

describe("frame", () => {
  it("sizes an automatic image to the graph at zoom 1", () => {
    const placed = frame({ x: -100, y: 50, width: 400, height: 200 }, null);
    expect(placed).toEqual({
      width: 400 + 2 * PADDING,
      height: 200 + 2 * PADDING,
      x: PADDING + 100,
      y: PADDING - 50,
      zoom: 1,
      pixelRatio: 2
    });
  });

  it("lowers the pixel ratio when a large graph would outgrow a canvas", () => {
    const placed = frame({ x: 0, y: 0, width: 12000, height: 300 }, null);
    expect(placed.width * placed.pixelRatio).toBeLessThanOrEqual(MAX_SIDE);
    expect(placed.pixelRatio).toBeLessThan(2);
  });

  it("fits and centres the graph inside a typed size", () => {
    const placed = frame({ x: 0, y: 0, width: 200, height: 100 }, { width: 1000, height: 1000 });
    const zoom = (1000 - 2 * PADDING) / 200;
    expect(placed.zoom).toBeCloseTo(zoom);
    expect(placed.x).toBeCloseTo(PADDING);
    expect(placed.y).toBeCloseTo((1000 - 100 * zoom) / 2);
    expect(placed.pixelRatio).toBe(1);
  });
});

describe("validSide", () => {
  it("takes whole pixels up to the canvas limit", () => {
    expect(validSide(1920)).toBe(true);
    expect(validSide(0)).toBe(false);
    expect(validSide(12.5)).toBe(false);
    expect(validSide(MAX_SIDE + 1)).toBe(false);
  });
});
