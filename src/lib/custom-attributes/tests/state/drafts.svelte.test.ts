import { describe, expect, it } from "vitest";
import {
  discardDraft,
  draftOf,
  isDirty,
  setDraft
} from "$lib/custom-attributes/state/drafts.svelte";
import type { CustomAttribute } from "$lib/custom-attributes/types";

function attribute(): CustomAttribute {
  return {
    id: crypto.randomUUID(),
    projectId: "p",
    name: "Expense per point",
    formula: "[expense] / [points]",
    position: 0,
    emptyCount: 2,
    createdAt: "",
    editedAt: ""
  };
}

describe("custom attribute drafts", () => {
  it("reads the applied version until something is edited", () => {
    const subject = attribute();
    expect(draftOf(subject)).toEqual({ name: subject.name, formula: subject.formula });
    expect(isDirty(subject)).toBe(false);
  });

  it("holds an edit until it is discarded", () => {
    const subject = attribute();
    setDraft(subject, { name: "Cost per point", formula: subject.formula });
    expect(draftOf(subject).name).toBe("Cost per point");
    expect(isDirty(subject)).toBe(true);

    discardDraft(subject);
    expect(draftOf(subject).name).toBe(subject.name);
    expect(isDirty(subject)).toBe(false);
  });

  it("is clean when the draft matches the applied version again", () => {
    const subject = attribute();
    setDraft(subject, { name: subject.name, formula: subject.formula });
    expect(isDirty(subject)).toBe(false);
  });

  it("keeps each attribute's draft apart", () => {
    const first = attribute();
    const second = attribute();
    setDraft(first, { name: first.name, formula: "[points] * 2" });
    expect(isDirty(first)).toBe(true);
    expect(isDirty(second)).toBe(false);
  });
});
