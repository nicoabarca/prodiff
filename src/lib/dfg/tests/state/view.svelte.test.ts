import { afterEach, describe, expect, it } from "vitest";
import {
  clearInspected,
  inspect,
  inspected,
  pointedPlace,
  reset,
  selected,
  tests
} from "$lib/dfg/state/view.svelte";

afterEach(() => {
  reset();
  tests.open = false;
});

describe("inspect", () => {
  it("opens the tests panel on a clicked activity and selects it", () => {
    inspect({ kind: "node", id: 3, label: "Review" });
    expect(tests.open).toBe(true);
    expect(selected.id).toBe(3);
    expect(inspected.place).toMatchObject({ kind: "node", id: 3 });
    expect(pointedPlace()).toBeNull();
  });

  it("lights a clicked edge and moves on each click, so it can be revealed again", () => {
    const edge = { kind: "edge" as const, source: 2, target: 3, label: "Review → Approve" };
    inspect(edge);
    const first = inspected.at;
    inspect(edge);
    expect(inspected.at).toBe(first + 1);
    expect(selected.id).toBeNull();
    expect(pointedPlace()).toEqual(edge);
  });

  it("goes back to every test once cleared", () => {
    inspect({ kind: "node", id: 3, label: "Review" });
    clearInspected();
    expect(inspected.place).toBeNull();
  });
});
