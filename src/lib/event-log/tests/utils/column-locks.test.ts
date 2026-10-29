import { describe, expect, it } from "vitest";
import { columnLocks, lockMessage } from "$lib/event-log/utils/column-locks";

const readers = { cost: ["Per day", "Total"], budget: ["Per day"] };
const direct = { budget: ["Per day"] };

describe("columnLocks", () => {
  it("leaves a column no formula reads free", () => {
    expect(columnLocks("other", readers, direct)).toEqual({
      readBy: [],
      settings: false,
      resolution: false
    });
  });

  it("freezes visibility, type and scope of an aggregated column, but not its resolution", () => {
    const locks = columnLocks("cost", readers, direct);
    expect(locks).toEqual({ readBy: ["Per day", "Total"], settings: true, resolution: false });
    expect(lockMessage(locks)).toBe(
      "Read by the custom attributes Per day, Total. Edit those formulas to hide, retype or rescope it."
    );
  });

  it("freezes the resolution of a column read directly", () => {
    const locks = columnLocks("budget", readers, direct);
    expect(locks.resolution).toBe(true);
    expect(lockMessage(locks)).toBe(
      "Read by the custom attribute Per day. Edit that formula to hide, retype or rescope it, or to change its case resolution."
    );
  });
});
