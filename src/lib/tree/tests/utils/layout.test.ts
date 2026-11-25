import { describe, expect, it } from "vitest";
import { layoutTree, type LayoutNode } from "$lib/tree/utils/layout";

const options = (volumes: Record<number, number>, orderKeys: Record<number, string> = {}) => ({
  size: () => ({ width: 100, height: 50 }),
  rankSep: 50,
  nodeSep: 20,
  volume: (id: number) => volumes[id] ?? 0,
  orderKey: (id: number) => orderKeys[id] ?? String(id)
});

/**
 *   0
 *  ╱ ╲
 * 1   2
 */
const fork: LayoutNode[] = [
  { id: 0, parent: null },
  { id: 1, parent: 0 },
  { id: 2, parent: 0 }
];

describe("layoutTree", () => {
  it("puts the least-executed sibling on the left", () => {
    const placed = layoutTree(fork, options({ 1: 5, 2: 90 }));
    expect((placed.get(1) as { x: number }).x).toBeLessThan((placed.get(2) as { x: number }).x);
  });

  it("keeps the order when the volumes swap", () => {
    const placed = layoutTree(fork, options({ 1: 90, 2: 5 }));
    expect((placed.get(2) as { x: number }).x).toBeLessThan((placed.get(1) as { x: number }).x);
  });

  it("breaks a tie on the stable key so the order never drifts", () => {
    const byLabel = layoutTree(fork, options({ 1: 7, 2: 7 }, { 1: "Zip", 2: "Apply" }));
    expect((byLabel.get(2) as { x: number }).x).toBeLessThan((byLabel.get(1) as { x: number }).x);
  });

  it("centres a parent over its children", () => {
    const placed = layoutTree(fork, options({ 1: 1, 2: 2 }));
    const left = (placed.get(1) as { x: number }).x;
    const right = (placed.get(2) as { x: number }).x;
    expect((placed.get(0) as { x: number }).x).toBe((left + right) / 2);
  });

  it("gives leaves one column each, a node wide plus the gap", () => {
    const placed = layoutTree(fork, options({ 1: 1, 2: 2 }));
    const left = (placed.get(1) as { x: number }).x;
    const right = (placed.get(2) as { x: number }).x;
    expect(right - left).toBe(120);
  });

  it("puts depth in y", () => {
    const placed = layoutTree(fork, options({ 1: 1, 2: 2 }));
    expect((placed.get(0) as { y: number }).y).toBe(0);
    expect((placed.get(1) as { y: number }).y).toBe(100);
  });

  it("holds a branch still when a sibling is added below another one", () => {
    const before = layoutTree(fork, options({ 1: 5, 2: 90 }));
    const after = layoutTree([...fork, { id: 3, parent: 2 }], options({ 1: 5, 2: 90, 3: 90 }));
    expect(after.get(1)).toEqual(before.get(1));
  });

  it("treats a node whose parent is absent as a root", () => {
    const placed = layoutTree([{ id: 4, parent: 99 }], options({ 4: 1 }));
    expect(placed.get(4)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("lays out a chain deep enough to blow a recursive walk", () => {
    const chain: LayoutNode[] = [{ id: 0, parent: null }];
    for (let id = 1; id < 20000; id++) chain.push({ id, parent: id - 1 });
    const placed = layoutTree(chain, options({}));
    expect(placed.size).toBe(20000);
    expect((placed.get(19999) as { y: number }).y).toBe(19999 * 100);
  });

  it("keeps a wide node clear of its neighbour in the same row", () => {
    // 0 ─ 1 ─ 3 (wide) ─ 5   and   0 ─ 2 ─ 4 (wide) ─ 6
    const chains: LayoutNode[] = [
      ...fork,
      { id: 3, parent: 1 },
      { id: 4, parent: 2 },
      { id: 5, parent: 3 },
      { id: 6, parent: 4 }
    ];
    const wide = new Set([3, 4]);
    const placed = layoutTree(chains, {
      ...options({ 1: 1, 2: 2 }),
      size: (id) => ({ width: wide.has(id) ? 180 : 100, height: 50 })
    });
    const three = placed.get(3) as { x: number; width: number };
    const four = placed.get(4) as { x: number };
    expect(four.x - (three.x + three.width)).toBeGreaterThanOrEqual(20);
  });

  it("gives every node in a row the row's tallest height", () => {
    const placed = layoutTree(fork, {
      ...options({ 1: 1, 2: 2 }),
      size: (id) => ({ width: 100, height: id === 2 ? 90 : 50 })
    });
    expect((placed.get(1) as { height: number }).height).toBe(90);
    expect((placed.get(0) as { height: number }).height).toBe(50);
  });
});
