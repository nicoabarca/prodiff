/**
* The only filter that reads another Group, not a column. It keeps the cases
* that are not in the Group it names.
 */
export interface CaseNotInGroupFilter {
  kind: "case_not_in_group";
  /** The Group whose cases are removed. Ids are never reused. */
  groupId: string;
}

export function describeCaseNotInGroup(
  filter: CaseNotInGroupFilter,
  groupName?: string
): { title: string; detail: string } {
  return {
    title: "Not in group",
    detail: groupName ?? filter.groupId
  };
}

export function isCaseNotInGroupComplete(filter: CaseNotInGroupFilter): boolean {
  return filter.groupId.length > 0;
}
