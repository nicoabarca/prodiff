import { describe, expect, it } from "vitest";
import { labelSize, settleLabels } from "$lib/dfg/utils/labels";

const wait = (id: string, value: string) => ({ id, color: `group-${id}`, value });

describe("labelSize", () => {
  it("is null when the edge has no wait to print", () => {
    expect(labelSize([], true)).toBeNull();
  });

  it("stacks one line per Group", () => {
    const one = labelSize([wait("a", "2.4 h")], false)!;
    const two = labelSize([wait("a", "2.4 h"), wait("b", "3.1 h")], true)!;

    expect(two.height).toBeGreaterThan(one.height);
  });

  it("is as wide as the longest line", () => {
    const short = labelSize([wait("a", "2 h"), wait("b", "3 h")], true)!;
    const long = labelSize([wait("a", "2 h"), wait("b", "3 d 4 h")], true)!;

    expect(long.width).toBeGreaterThan(short.width);
  });
});

describe("settleLabels", () => {
  const size = { width: 40, height: 20 };

  it("draws a label on its edge's line when nothing is in the way", () => {
    const settled = settleLabels(
      [{ key: "a", size, onLine: [{ x: 0, y: 0 }], reserved: { x: 30, y: 0 } }],
      []
    );
    expect(settled.get("a")).toEqual({ x: 0, y: 0 });
  });

  it("slides along the line past a neighbour's reserved room", () => {
    const settled = settleLabels(
      [
        {
          key: "a",
          size,
          onLine: [
            { x: 25, y: 0 },
            { x: 25, y: 60 }
          ],
          reserved: { x: 0, y: 0 }
        },
        { key: "b", size, onLine: [], reserved: { x: 50, y: 0 } }
      ],
      []
    );
    expect(settled.get("a")).toEqual({ x: 25, y: 60 });
  });

  it("keeps the reserved room when no spot on the line is clear", () => {
    const node = { x: -100, y: -100, width: 200, height: 200 };
    const settled = settleLabels(
      [{ key: "a", size, onLine: [{ x: 0, y: 0 }], reserved: { x: 300, y: 0 } }],
      [node]
    );
    expect(settled.get("a")).toEqual({ x: 300, y: 0 });
  });
});
