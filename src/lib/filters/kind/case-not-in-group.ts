/**
 * The only filter that reads another Group rather than a column. It keeps the
 * cases that are not in the Group it names, which is how two overlapping Groups
 * are pulled apart — a Filter List is an AND pipeline and the model has no OR,
 * so negating one term by term gives a different, smaller set (`docs/adr/0006`).
 */
export interface CaseNotInGroupFilter {
  kind: "case_not_in_group";
  /** The Group whose cases are removed. Never reused, so it cannot go stale. */
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
