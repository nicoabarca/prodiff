import { beforeEach, describe, expect, it } from "vitest";
import {
  customAttributes,
  customAttributesLoaded,
  directReadersByColumn,
  readersByColumn
} from "$lib/custom-attributes/state/custom-attributes.svelte";
import { discardDraft, setDraft } from "$lib/custom-attributes/state/drafts.svelte";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import type { Project } from "$lib/event-log/types";

const project = { id: "p" } as Project;

function attribute(id: string, name: string, formula: string): CustomAttribute {
  return {
    id,
    projectId: "p",
    name,
    scope: "event",
    formula,
    position: 0,
    emptyCount: 0,
    createdAt: "",
    editedAt: ""
  };
}

describe("readersByColumn", () => {
  beforeEach(() => {
    customAttributes.splice(
      0,
      customAttributes.length,
      attribute("a1", "Per point", "[expense] / [points]"),
      attribute("a2", "Double", "[points] * 2")
    );
    customAttributesLoaded.projectId = "p";
    for (const a of customAttributes) discardDraft(a);
  });

  it("names every attribute that reads a column", () => {
    expect(readersByColumn(project)).toEqual({
      expense: ["Per point"],
      points: ["Per point", "Double"]
    });
  });

  it("counts a draft's columns too, under the draft's name", () => {
    setDraft(customAttributes[1], { name: "Twice", scope: "event", formula: "[amount] * 2" });
    expect(readersByColumn(project)).toEqual({
      expense: ["Per point"],
      points: ["Per point", "Twice"],
      amount: ["Twice"]
    });
  });

  it("knows nothing of another project", () => {
    expect(readersByColumn({ id: "q" } as Project)).toEqual({});
  });

  it("counts aggregate arguments, which only the direct readers leave out", () => {
    customAttributes.push({
      ...attribute("a3", "Per day", "[budget] / sum([expense]) / duration()"),
      scope: "case"
    });
    expect(readersByColumn(project)).toEqual({
      expense: ["Per point", "Per day"],
      points: ["Per point", "Double"],
      budget: ["Per day"]
    });
    expect(directReadersByColumn(project)).toEqual({
      expense: ["Per point"],
      points: ["Per point", "Double"],
      budget: ["Per day"]
    });
  });
});
