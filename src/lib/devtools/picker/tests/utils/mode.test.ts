import { describe, expect, it } from "vitest";
import { modeShortcut } from "$lib/devtools/picker/utils/mode";

const key = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key, ...init });

describe("modeShortcut", () => {
  it("maps ⌘⇧A to Ask and ⌘⇧D to Do, with Ctrl too", () => {
    expect(modeShortcut(key("a", { metaKey: true, shiftKey: true }))).toBe("ask");
    expect(modeShortcut(key("D", { ctrlKey: true, shiftKey: true }))).toBe("do");
  });

  it("ignores the keys without both modifiers or with Alt", () => {
    expect(modeShortcut(key("a", { metaKey: true }))).toBeNull();
    expect(modeShortcut(key("A", { shiftKey: true }))).toBeNull();
    expect(modeShortcut(key("a", { metaKey: true, shiftKey: true, altKey: true }))).toBeNull();
    expect(modeShortcut(key("k", { metaKey: true, shiftKey: true }))).toBeNull();
  });
});
