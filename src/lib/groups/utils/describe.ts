import { describeFilter, type Filter } from "$lib/filters/kind/filter";
import { groups } from "$lib/groups/state/groups.svelte";
import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * A filter chip's title and detail, with Group ids and Custom Attribute columns
 * resolved to the names the user gave them. `describeFilter` cannot do this
 * itself: it only ever sees the stored ids.
 */
export function describeGroupFilter(filter: Filter): { title: string; detail: string } {
  const described = describeFilter(filter);
  if (filter.kind === "numeric") return { ...described, title: attributeLabel(filter.column) };
  if (filter.kind !== "case_not_in_group") return described;
  const excluded = groups.find((group) => group.id === filter.groupId);
  return { ...described, detail: excluded?.name ?? "a deleted group" };
}
