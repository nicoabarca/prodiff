/**
 * Shared color logic for the column-picking table in the "Map columns" wizard
 * step. Every column the mapping keeps reads the same indigo, whatever it was
 * picked for; everything else dims blue on hover.
 */
export type ColumnPickState = "picked" | "none";

export function columnHeaderClass(pick: ColumnPickState, hovered: boolean): string {
  if (pick === "picked") return "bg-primary text-primary-foreground";
  if (hovered) return "bg-primary/10 text-foreground";
  return "bg-card text-muted-foreground";
}

export function columnCellClass(pick: ColumnPickState, hovered: boolean): string {
  if (pick === "picked") {
    return `text-accent-foreground cursor-pointer ${hovered ? "bg-accent/70" : "bg-accent"}`;
  }
  return `text-muted-foreground cursor-pointer ${hovered ? "bg-primary/10" : ""}`;
}
