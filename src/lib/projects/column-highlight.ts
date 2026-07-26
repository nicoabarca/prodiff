/**
 * Shared color logic for the column-picking tables in the "Required fields"
 * and "Other fields" wizard steps: locked columns are always muted, selected
 * columns are indigo/accent, everything else dims blue on hover.
 */
export function columnHeaderClass(locked: boolean, selected: boolean, hovered: boolean): string {
  if (locked) return "bg-muted text-muted-foreground cursor-default";
  if (selected) return "bg-primary text-primary-foreground";
  if (hovered) return "bg-primary/10 text-foreground";
  return "bg-card text-muted-foreground";
}

export function columnCellClass(locked: boolean, selected: boolean, hovered: boolean): string {
  if (locked) return "text-muted-foreground bg-muted cursor-default";
  if (selected) {
    return `text-accent-foreground cursor-pointer ${hovered ? "bg-accent/70" : "bg-accent"}`;
  }
  return `text-muted-foreground cursor-pointer ${hovered ? "bg-primary/10" : ""}`;
}
