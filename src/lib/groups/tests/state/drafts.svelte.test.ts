import { beforeEach, describe, expect, it } from "vitest";
import type { Filter } from "$lib/filters/kind/filter";
import {
  addToDraft,
  discardDraft,
  draftOf,
  isDirty,
  moveInDraft,
  removeFromDraft
} from "$lib/groups/state/drafts.svelte";
import type { Group } from "$lib/groups/types";

function filter(column: string): Filter {
  return { kind: "attribute", column, mode: "mandatory", values: ["x"] };
}

function group(filters: Filter[] = []): Group {
  return {
    id: crypto.randomUUID(),
    projectId: "p",
    name: "Group",
    color: "group-1",
    position: 0,
    filters,
    stats: null,
    createdAt: "",
    editedAt: ""
  };
}

describe("drafts", () => {
  let subject: Group;

  beforeEach(() => {
    subject = group([filter("a"), filter("b")]);
  });

  it("reads the applied list until something is edited", () => {
    expect(draftOf(subject)).toEqual(subject.filters);
    expect(isDirty(subject)).toBe(false);
  });

  it("is dirty once the draft differs", () => {
    addToDraft(subject, filter("c"));
    expect(draftOf(subject)).toHaveLength(3);
    expect(isDirty(subject)).toBe(true);
  });

  it("is not dirty when an edit lands back on the applied list", () => {
    addToDraft(subject, filter("c"));
    removeFromDraft(subject, 2);
    expect(isDirty(subject)).toBe(false);
  });

  it("reorders rather than swapping, so the rest keep their order", () => {
    addToDraft(subject, filter("c"));
    moveInDraft(subject, 0, 2);
    expect(draftOf(subject).map((f) => (f.kind === "attribute" ? f.column : ""))).toEqual([
      "b",
      "c",
      "a"
    ]);
  });

  it("forgets the draft when it is discarded", () => {
    addToDraft(subject, filter("c"));
    discardDraft(subject);
    expect(draftOf(subject)).toEqual(subject.filters);
    expect(isDirty(subject)).toBe(false);
  });
});
