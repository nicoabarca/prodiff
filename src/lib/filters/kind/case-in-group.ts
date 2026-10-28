/**
 * The inverse of `case_not_in_group`: keeps only the cases that are also in the
 * Group it names. Internal: the app adds it to show the cases a Comparison
 * removed, and the filter picker never offers it.
 */
export interface CaseInGroupFilter {
  kind: "case_in_group";
  groupId: string;
}

export function describeCaseInGroup(
  filter: CaseInGroupFilter,
  groupName?: string
): { title: string; detail: string } {
  return {
    title: "In group",
    detail: groupName ?? filter.groupId
  };
}

export function isCaseInGroupComplete(filter: CaseInGroupFilter): boolean {
  return filter.groupId.length > 0;
}
