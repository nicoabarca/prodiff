import type { Target } from "$lib/tour/types";

function escape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/** The CSS selector for a target path, outermost first. */
export function selector(path: Target[]): string {
  return path
    .map(({ anchor, key }) =>
      key === undefined
        ? `[data-tour="${escape(anchor)}"]`
        : `[data-tour="${escape(anchor)}"][data-tour-key="${escape(key)}"]`
    )
    .join(" ");
}
