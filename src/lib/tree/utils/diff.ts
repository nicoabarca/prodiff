/**
 * What changed between two builds, in stable keys. Only structure is compared:
 * a node whose counts moved is neither added nor removed.
 */

export interface TreeDiff {
  added: Set<string>;
  removed: Set<string>;
}

export function diffKeys(previous: Iterable<string>, next: Iterable<string>): TreeDiff {
  const before = new Set(previous);
  const after = new Set(next);
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const key of after) if (!before.has(key)) added.add(key);
  for (const key of before) if (!after.has(key)) removed.add(key);
  return { added, removed };
}
