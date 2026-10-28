import { describe, expect, it } from "vitest";
import type { ResponseRelation } from "$lib/groups/invokers/types";
import type { Group } from "$lib/groups/types";
import {
  afterApplyCopy,
  comparisonSentence,
  reducedSides,
  refusalCopy,
  relationCopy,
  removedChip,
  removedCopy,
  removedFilters
} from "$lib/groups/utils/comparison-note";

function group(id: string, name: string): Group {
  return {
    id,
    projectId: "p",
    name,
    color: "group-1",
    position: 0,
    filters: [],
    stats: null,
    createdAt: "",
    editedAt: ""
  };
}

const approved = group("a", "Approved");
const slow = group("s", "Slow cases");
const log = group("original", "Event Log");

function summary(partial: Partial<ResponseRelation>): ResponseRelation {
  return {
    status: "ok",
    relation: "disjoint",
    inner: null,
    cases: {},
    kept: {},
    removed: {},
    ...partial
  };
}

const partial = summary({
  relation: "partial",
  cases: { a: 1240, s: 760 },
  kept: { a: 930, s: 450 },
  removed: { a: 310, s: 310 }
});

const contained = summary({
  relation: "contained",
  inner: "a",
  cases: { original: 4000, a: 1240 },
  kept: { original: 2760, a: 1240 },
  removed: { original: 1240, a: 0 }
});

describe("comparisonSentence", () => {
  it("names both Groups and the cases removed from both", () => {
    expect(comparisonSentence([approved, slow], partial)).toBe(
      "Approved vs Slow cases, 310 shared cases removed from both."
    );
  });

  it("names the outer Group of a contained pair", () => {
    expect(comparisonSentence([log, approved], contained)).toBe(
      "Event Log vs Approved, 1,240 cases removed from Event Log."
    );
  });

  it("uses the singular for one case", () => {
    const one = summary({
      relation: "partial",
      kept: { a: 9, s: 9 },
      removed: { a: 1, s: 1 }
    });
    expect(comparisonSentence([approved, slow], one)).toBe(
      "Approved vs Slow cases, 1 shared case removed from both."
    );
  });

  it("says whose tests were skipped", () => {
    const small = summary({
      relation: "partial",
      kept: { a: 3, s: 450 },
      removed: { a: 997, s: 997 }
    });
    expect(comparisonSentence([approved, slow], small)).toBe(
      "Approved vs Slow cases, 997 shared cases removed from both. Tests skipped for Approved: fewer than 5 cases."
    );
  });

  it("says nothing for a disjoint pair or a single Group", () => {
    const disjoint = summary({ kept: { a: 10, s: 10 }, removed: { a: 0, s: 0 } });
    expect(comparisonSentence([approved, slow], disjoint)).toBeNull();
    expect(comparisonSentence([approved], null)).toBeNull();
  });
});

describe("popover copy", () => {
  it("describes what each overlap will remove", () => {
    expect(relationCopy([approved, slow], partial)).toBe(
      "Approved and Slow cases share 310 cases. Tests need groups with no case in common, so those cases are removed from both."
    );
    expect(relationCopy([log, approved], contained)).toBe(
      "Every Approved case is also in Event Log. Tests need groups with no case in common, so Approved's cases are removed from Event Log."
    );
  });

  it("explains a refusal", () => {
    expect(refusalCopy([approved, slow], summary({ status: "identical" }))).toBe(
      "These groups hold exactly the same cases, so there is nothing to compare. View one of them on its own."
    );
    expect(refusalCopy([approved, slow], summary({ status: "empty", cases: { a: 0, s: 4 } }))).toBe(
      "Approved has no cases, so there is nothing to compare."
    );
  });

  it("names the Comparison an Apply broke", () => {
    expect(afterApplyCopy([approved, slow], summary({ status: "identical" }))).toBe(
      "Approved vs Slow cases can no longer be compared: the groups hold the same cases."
    );
  });
});

describe("removed cases", () => {
  it("puts a chip on both sides of a partial overlap", () => {
    const sides = reducedSides([approved, slow], partial);
    expect(sides.map((side) => [side.group.id, side.other.id, removedChip(side)])).toEqual([
      ["a", "s", "−310"],
      ["s", "a", "−310"]
    ]);
  });

  it("puts a chip only on the outer side of a contained pair", () => {
    const sides = reducedSides([log, approved], contained);
    expect(sides.map((side) => side.group.id)).toEqual(["original"]);
    expect(removedChip(sides[0])).toBe("−1,240");
  });

  it("puts no chip on a disjoint, refused or single comparison", () => {
    const disjoint = summary({ kept: { a: 10, s: 10 }, removed: { a: 0, s: 0 } });
    expect(reducedSides([approved, slow], disjoint)).toEqual([]);
    expect(reducedSides([approved, slow], summary({ status: "identical" }))).toEqual([]);
    expect(reducedSides([approved], partial)).toEqual([]);
  });

  it("says why each side lost its cases", () => {
    const [side] = reducedSides([approved, slow], partial);
    expect(removedCopy(side, partial)).toBe(
      "Approved shares 310 cases with Slow cases. Tests need groups with no case in common, so they are removed from both."
    );
    const [outer] = reducedSides([log, approved], contained);
    expect(removedCopy(outer, contained)).toBe(
      "Every Approved case is also in Event Log. Tests need groups with no case in common, so these 1,240 cases are removed from Event Log."
    );
  });

  it("narrows a side to the cases it shares with the other Group", () => {
    const [a, s] = reducedSides([approved, slow], partial);
    expect(removedFilters(a)).toEqual([{ kind: "case_in_group", groupId: "s" }]);
    expect(removedFilters(s)).toEqual([{ kind: "case_in_group", groupId: "a" }]);
    const [outer] = reducedSides([log, approved], contained);
    expect(removedFilters(outer)).toEqual([{ kind: "case_in_group", groupId: "a" }]);
  });
});
