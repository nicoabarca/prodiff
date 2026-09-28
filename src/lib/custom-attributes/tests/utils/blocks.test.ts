import { describe, expect, it } from "vitest";
import {
  fromBlocks,
  insertAt,
  insertParentheses,
  moveCaret,
  removeBefore,
  toBlocks,
  type Block
} from "$lib/custom-attributes/utils/blocks";

const a: Block = { kind: "column", name: "a" };
const b: Block = { kind: "column", name: "b" };
const divide: Block = { kind: "operator", op: "/" };

describe("toBlocks", () => {
  it("turns each token into a block, finished or not", () => {
    expect(toBlocks("[a] /")).toEqual([a, divide]);
  });

  it("gives up on text that does not tokenize", () => {
    expect(toBlocks("[a")).toBeNull();
    expect(toBlocks("[a] % 2")).toBeNull();
  });
});

describe("fromBlocks", () => {
  it("spells the blocks as formula text", () => {
    const blocks: Block[] = [
      { kind: "open" },
      a,
      { kind: "operator", op: "+" },
      { kind: "column", name: "x]y" },
      { kind: "close" },
      { kind: "operator", op: "*" },
      { kind: "number", value: 0.5 }
    ];
    expect(fromBlocks(blocks)).toBe("([a] + [x]]y]) * 0.5");
  });

  it("round-trips text through blocks", () => {
    for (const text of ["[a] / [b]", "([a] - 2) * [b]", "[a] +", "- [a]"]) {
      expect(fromBlocks(toBlocks(text)!)).toBe(text);
    }
  });
});

describe("editing", () => {
  it("inserts at the caret and moves past the insertion", () => {
    expect(insertAt({ blocks: [a, b], caret: 1 }, [divide])).toEqual({
      blocks: [a, divide, b],
      caret: 2
    });
  });

  it("puts the caret inside a new pair of parentheses", () => {
    expect(insertParentheses({ blocks: [a], caret: 1 })).toEqual({
      blocks: [a, { kind: "open" }, { kind: "close" }],
      caret: 2
    });
  });

  it("removes the block before the caret", () => {
    expect(removeBefore({ blocks: [a, divide, b], caret: 2 })).toEqual({
      blocks: [a, b],
      caret: 1
    });
    expect(removeBefore({ blocks: [a], caret: 0 })).toEqual({ blocks: [a], caret: 0 });
  });

  it("keeps the caret within the blocks", () => {
    expect(moveCaret({ blocks: [a, b], caret: 1 }, 5).caret).toBe(2);
    expect(moveCaret({ blocks: [a, b], caret: 1 }, -1).caret).toBe(0);
  });
});
