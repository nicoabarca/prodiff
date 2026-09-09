import { describe, expect, it } from "vitest";
import { layoutTree, type LayoutNode } from "$lib/tree/utils/layout";

const options = (volumes: Record<number, number>, orderKeys: Record<number, string> = {}) => ({
  nodeWidth: 100,
  nodeHeight: 50,
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
    expect(placed.get(4)).toEqual({ x: 0, y: 0 });
  });

  it("lays out a chain deep enough to blow a recursive walk", () => {
    const chain: LayoutNode[] = [{ id: 0, parent: null }];
    for (let id = 1; id < 20000; id++) chain.push({ id, parent: id - 1 });
    const placed = layoutTree(chain, options({}));
    expect(placed.size).toBe(20000);
    expect((placed.get(19999) as { y: number }).y).toBe(19999 * 100);
  });
});
