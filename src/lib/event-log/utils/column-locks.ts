/**
 * What the Custom Attributes reading a column freeze about it. `readers` names
 * every attribute reading the column, aggregate arguments included; `direct`
 * only those reading it as a bracketed operand, which a Case attribute reads
 * from the row the column's case resolution names.
 */
export interface ColumnLocks {
  readBy: string[];
  settings: boolean;
  resolution: boolean;
}

export function columnLocks(
  name: string,
  readers: Record<string, string[]>,
  direct: Record<string, string[]>
): ColumnLocks {
  const readBy = readers[name] ?? [];
  return {
    readBy,
    settings: readBy.length > 0,
    resolution: (direct[name] ?? []).length > 0
  };
}

/** The sentence under a column that formulas read, naming them. */
export function lockMessage(locks: ColumnLocks): string {
  const many = locks.readBy.length > 1;
  const change = locks.resolution
    ? "hide, retype or rescope it, or to change its case resolution"
    : "hide, retype or rescope it";
  return `Read by the custom attribute${many ? "s" : ""} ${locks.readBy.join(", ")}. Edit ${
    many ? "those formulas" : "that formula"
  } to ${change}.`;
}
