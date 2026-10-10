import { describe, expect, it } from "vitest";
import { NO_GROUP, ORIGINAL_ID, type SavedComparison } from "$lib/groups/types";
import {
  comparisonAction,
  draftGroupIds,
  saveTarget,
  savedMatching,
  toDraft
} from "$lib/groups/utils/saved-comparisons";

const saved = (id: string, groupIds: string[]): SavedComparison => ({
  id,
  projectId: "p",
  groupIds,
  createdAt: 0
});

const approvedRejected = saved("s1", ["approved", "rejected"]);
const originalAlone = saved("s2", [ORIGINAL_ID]);
const all = [approvedRejected, originalAlone];

describe("toDraft and draftGroupIds", () => {
  it("round-trip a pair and a single Group", () => {
    expect(draftGroupIds(toDraft(["approved", "rejected"]))).toEqual(["approved", "rejected"]);
    expect(draftGroupIds(toDraft(["approved"]))).toEqual(["approved"]);
  });

  it("fall back to the Original against nothing", () => {
    expect(toDraft([])).toEqual([ORIGINAL_ID, NO_GROUP]);
  });
});

describe("savedMatching", () => {
  it("finds the Saved Comparison in use", () => {
    expect(savedMatching(all, ["approved", "rejected"])).toBe(approvedRejected);
    expect(savedMatching(all, [ORIGINAL_ID])).toBe(originalAlone);
  });

  it("treats the same Groups in the other order as another Comparison", () => {
    expect(savedMatching(all, ["rejected", "approved"])).toBeNull();
  });

  it("does not match a pair by its first Group alone", () => {
    expect(savedMatching(all, ["approved"])).toBeNull();
  });
});

describe("comparisonAction", () => {
  it("is comparing for an unchanged Saved Comparison in use", () => {
    expect(
      comparisonAction(approvedRejected, ["approved", "rejected"], ["approved", "rejected"])
    ).toBe("comparing");
  });

  it("compares an unchanged Saved Comparison that is not in use", () => {
    expect(comparisonAction(approvedRejected, ["approved", "rejected"], [ORIGINAL_ID])).toBe(
      "compare"
    );
  });

  it("saves a changed side, in use or not", () => {
    expect(
      comparisonAction(approvedRejected, ["approved", NO_GROUP], ["approved", "rejected"])
    ).toBe("save-and-compare");
    expect(comparisonAction(approvedRejected, ["rejected", "approved"], [ORIGINAL_ID])).toBe(
      "save-and-compare"
    );
  });

  it("saves a new draft even when it equals what is compared", () => {
    expect(comparisonAction(null, [ORIGINAL_ID, NO_GROUP], [ORIGINAL_ID])).toBe("save-and-compare");
  });
});

describe("saveTarget", () => {
  it("creates a row for a new draft no Saved Comparison holds", () => {
    expect(saveTarget(null, ["rejected", NO_GROUP], all)).toEqual({ kind: "create" });
  });

  it("reuses the Saved Comparison a new draft duplicates", () => {
    expect(saveTarget(null, ["approved", "rejected"], all)).toEqual({ kind: "existing", id: "s1" });
  });

  it("updates the selected row when its sides changed", () => {
    expect(saveTarget(approvedRejected, ["approved", "paid"], all)).toEqual({
      kind: "update",
      id: "s1"
    });
  });

  it("reuses another Saved Comparison a changed row would duplicate", () => {
    expect(saveTarget(approvedRejected, [ORIGINAL_ID, NO_GROUP], all)).toEqual({
      kind: "existing",
      id: "s2"
    });
  });
});
