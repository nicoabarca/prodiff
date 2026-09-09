/**
 * Lays out a prefix tree. Depth gives the row, leaves take sequential columns
 * and a parent sits centred over its children. Siblings run least-executed
 * first, so the busiest path is the rightmost one.
 *
 * Coordinates are the node's top-left corner, in the units the canvas draws in.
 */

export interface LayoutNode {
  id: number;
  parent: number | null;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  rankSep: number;
  nodeSep: number;
  volume: (id: number) => number;
  orderKey: (id: number) => string;
}

export interface Point {
  x: number;
  y: number;
}

export function layoutTree(nodes: LayoutNode[], options: LayoutOptions): Map<number, Point> {
  const present = new Set(nodes.map((node) => node.id));
  const kids = new Map<number, number[]>();
  const roots: number[] = [];
  for (const node of nodes) {
    if (node.parent === null || !present.has(node.parent)) {
      roots.push(node.id);
      continue;
    }
    const siblings = kids.get(node.parent);
    if (siblings) siblings.push(node.id);
    else kids.set(node.parent, [node.id]);
  }

  const order = (a: number, b: number) =>
    options.volume(a) - options.volume(b) || options.orderKey(a).localeCompare(options.orderKey(b));
  for (const siblings of kids.values()) siblings.sort(order);
  roots.sort(order);

  const depth = new Map<number, number>();
  for (const root of roots) {
    const stack: number[] = [root];
    depth.set(root, 0);
    while (stack.length) {
      const id = stack.pop() as number;
      const level = (depth.get(id) ?? 0) + 1;
      for (const child of kids.get(id) ?? []) {
        depth.set(child, level);
        stack.push(child);
      }
    }
  }

  const column = options.nodeWidth + options.nodeSep;
  const row = options.nodeHeight + options.rankSep;
  const positions = new Map<number, Point>();
  let slot = 0;

  for (const root of roots) {
    const stack: { id: number; expanded: boolean }[] = [{ id: root, expanded: false }];
    while (stack.length) {
      const frame = stack.pop() as { id: number; expanded: boolean };
      const children = kids.get(frame.id) ?? [];
      if (!frame.expanded && children.length > 0) {
        stack.push({ id: frame.id, expanded: true });
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ id: children[i], expanded: false });
        }
        continue;
      }
      const y = (depth.get(frame.id) ?? 0) * row;
      if (children.length === 0) {
        positions.set(frame.id, { x: slot * column, y });
        slot += 1;
        continue;
      }
      const first = positions.get(children[0])?.x ?? 0;
      const last = positions.get(children[children.length - 1])?.x ?? first;
      positions.set(frame.id, { x: (first + last) / 2, y });
    }
  }

  return positions;
}
