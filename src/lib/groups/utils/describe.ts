import { describeFilter, type Filter } from "$lib/filters/kind/filter";
import { groups } from "$lib/groups/state/groups.svelte";

/**
 * A filter chip's title and detail, with Group ids resolved to the names the
 * user gave them. `describeFilter` cannot do this itself: the filter domain
 * sits below Groups and only ever stores the id.
 */
export function describeGroupFilter(filter: Filter): { title: string; detail: string } {
  const described = describeFilter(filter);
  if (filter.kind !== "case_not_in_group") return described;
  const excluded = groups.find((group) => group.id === filter.groupId);
  return { ...described, detail: excluded?.name ?? "a deleted group" };
}
