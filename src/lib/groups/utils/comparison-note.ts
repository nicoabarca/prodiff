import { formatNumber } from "$lib/format";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseRelation } from "$lib/groups/invokers/types";
import { MIN_GROUP_CASES } from "$lib/analysis/types";
import type { Group } from "$lib/groups/types";

function cases(count: number, noun = "case"): string {
  return `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The always-visible line under what is compared: which Groups, what the rule
 * removed and from which side, and whose tests were skipped. `null` when there
 * is nothing to say.
 */
export function comparisonSentence(
  groups: Group[],
  summary: ResponseRelation | null
): string | null {
  if (groups.length !== 2 || !summary || summary.status !== "ok") return null;
  const [a, b] = groups;
  const removedA = summary.removed[a.id] ?? 0;
  const removedB = summary.removed[b.id] ?? 0;
  const small = groups.filter((group) => (summary.kept[group.id] ?? 0) < MIN_GROUP_CASES);
  if (removedA === 0 && removedB === 0 && small.length === 0) return null;

  let sentence = `${a.name} vs ${b.name}`;
  if (removedA > 0 && removedB > 0) {
    sentence += `, ${cases(removedA, "shared case")} removed from both`;
  } else if (removedA > 0 || removedB > 0) {
    const outer = removedA > 0 ? a : b;
    sentence += `, ${cases(Math.max(removedA, removedB))} removed from ${outer.name}`;
  }
  sentence += ".";
  for (const group of small) {
    sentence += ` Tests skipped for ${group.name}: fewer than ${MIN_GROUP_CASES} cases.`;
  }
  return sentence;
}

/** A side the comparison removed cases from, and the Group they are shared with. */
export interface ReducedSide {
  group: Group;
  other: Group;
  removed: number;
}

/** The reduced sides of a comparison that went ahead, in the order they are drawn. */
export function reducedSides(groups: Group[], summary: ResponseRelation | null): ReducedSide[] {
  if (groups.length !== 2 || !summary || summary.status !== "ok") return [];
  const [a, b] = groups;
  return [
    { group: a, other: b, removed: summary.removed[a.id] ?? 0 },
    { group: b, other: a, removed: summary.removed[b.id] ?? 0 }
  ].filter((side) => side.removed > 0);
}

/** The chip on a reduced side: how many cases it lost. */
export function removedChip(side: ReducedSide): string {
  return `−${formatNumber(side.removed)}`;
}

/** Why a reduced side lost its cases, for the card behind its chip. */
export function removedCopy(side: ReducedSide, summary: ResponseRelation): string {
  const { group, other } = side;
  if (summary.relation === "contained") {
    return `Every ${other.name} case is also in ${group.name}. Tests need groups with no case in common, so these ${cases(side.removed)} are removed from ${group.name}.`;
  }
  return `${group.name} shares ${cases(side.removed)} with ${other.name}. Tests need groups with no case in common, so they are removed from both.`;
}

/**
 * The filters that narrow a reduced side to the cases it lost. Both relations
 * remove the cases the side shares with the other Group: the intersection in a
 * partial overlap, and the inner Group's cases from the outer one.
 */
export function removedFilters(side: ReducedSide): Filter[] {
  return [{ kind: "case_in_group", groupId: side.other.id }];
}

/** What comparing two overlapping Groups will do, shown before Compare. `null` when disjoint. */
export function relationCopy(groups: Group[], summary: ResponseRelation): string | null {
  const [a, b] = groups;
  if (summary.relation === "partial") {
    const shared = summary.removed[a.id] ?? 0;
    return `${a.name} and ${b.name} share ${cases(shared)}. Tests need groups with no case in common, so those cases are removed from both.`;
  }
  if (summary.relation === "contained") {
    const inner = groups.find((group) => group.id === summary.inner) ?? a;
    const outer = groups.find((group) => group.id !== inner.id) ?? b;
    return `Every ${inner.name} case is also in ${outer.name}. Tests need groups with no case in common, so ${inner.name}'s cases are removed from ${outer.name}.`;
  }
  return null;
}

/** Why two Groups cannot be compared. */
export function refusalCopy(groups: Group[], summary: ResponseRelation): string {
  if (summary.status === "empty") {
    const empty = groups.find((group) => (summary.cases[group.id] ?? 0) === 0) ?? groups[0];
    return `${empty.name} has no cases, so there is nothing to compare.`;
  }
  return "These groups hold exactly the same cases, so there is nothing to compare. View one of them on its own.";
}

/** The note raised after an Apply leaves a Comparison that can no longer be compared. */
export function afterApplyCopy(groups: Group[], summary: ResponseRelation): string {
  const [a, b] = groups;
  if (summary.status === "empty") {
    const empty = groups.find((group) => (summary.cases[group.id] ?? 0) === 0) ?? a;
    return `${a.name} vs ${b.name} can no longer be compared: ${empty.name} has no cases.`;
  }
  return `${a.name} vs ${b.name} can no longer be compared: the groups hold the same cases.`;
}
