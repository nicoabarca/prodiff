/**
 * Lays out a prefix tree. Depth gives the row, and every node in a row takes
 * the height of the row's tallest. Leaves run left to right, each as wide as
 * its own node or the subtree below it, and a parent sits centred over its
 * children. Siblings run least-executed first, so the busiest path is the
 * rightmost one.
 *
 * Coordinates are the node's top-left corner, in the units the canvas draws in.
 */

export interface LayoutNode {
  id: number;
  parent: number | null;
}

export interface Size {
  width: number;
  height: number;
}

export interface LayoutOptions {
  size: (id: number) => Size;
  rankSep: number;
  nodeSep: number;
  volume: (id: number) => number;
  orderKey: (id: number) => string;
}

export interface Point {
  x: number;
  y: number;
}

export type Box = Point & Size;

export function layoutTree(nodes: LayoutNode[], options: LayoutOptions): Map<number, Box> {
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

  const sizes = new Map(nodes.map((node) => [node.id, options.size(node.id)]));
  const depth = new Map<number, number>();
  const rowHeight: number[] = [];
  // Parents before children, so the reverse visits every child before its parent.
  const preorder: number[] = [];
  for (const root of roots) {
    const stack: number[] = [root];
    depth.set(root, 0);
    while (stack.length) {
      const id = stack.pop() as number;
      preorder.push(id);
      const level = depth.get(id) as number;
      rowHeight[level] = Math.max(rowHeight[level] ?? 0, (sizes.get(id) as Size).height);
      for (const child of kids.get(id) ?? []) {
        depth.set(child, level + 1);
        stack.push(child);
      }
    }
  }

  const rowTop: number[] = [];
  let top = 0;
  for (const height of rowHeight) {
    rowTop.push(top);
    top += height + options.rankSep;
  }

  const blockWidth = (ids: number[]) =>
    ids.reduce((sum, id) => sum + (span.get(id) as number), 0) +
    options.nodeSep * Math.max(0, ids.length - 1);
  const span = new Map<number, number>();
  for (let i = preorder.length - 1; i >= 0; i--) {
    const id = preorder[i];
    span.set(id, Math.max((sizes.get(id) as Size).width, blockWidth(kids.get(id) ?? [])));
  }

  const left = new Map<number, number>();
  let cursor = 0;
  for (const root of roots) {
    left.set(root, cursor);
    cursor += (span.get(root) as number) + options.nodeSep;
  }
  for (const id of preorder) {
    const children = kids.get(id) ?? [];
    let x = (left.get(id) as number) + ((span.get(id) as number) - blockWidth(children)) / 2;
    for (const child of children) {
      left.set(child, x);
      x += (span.get(child) as number) + options.nodeSep;
    }
  }

  // Children before parents, so a parent can centre over where they landed.
  const positions = new Map<number, Box>();
  for (let i = preorder.length - 1; i >= 0; i--) {
    const id = preorder[i];
    const size = sizes.get(id) as Size;
    const from = left.get(id) as number;
    const width = span.get(id) as number;
    const children = kids.get(id) ?? [];
    const centreOf = (child: number) => {
      const box = positions.get(child) as Box;
      return box.x + box.width / 2;
    };
    const wanted =
      children.length === 0
        ? from + width / 2
        : (centreOf(children[0]) + centreOf(children[children.length - 1])) / 2;
    const centre = Math.min(
      Math.max(wanted, from + size.width / 2),
      from + width - size.width / 2
    );
    const level = depth.get(id) as number;
    positions.set(id, {
      x: centre - size.width / 2,
      y: rowTop[level],
      width: size.width,
      height: rowHeight[level]
    });
  }

  return positions;
}
