import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ value: null as string[] | null, writeSetting: vi.fn() }));

vi.mock("$lib/db/app-settings", () => ({
  readSetting: async () => stored.value,
  writeSetting: stored.writeSetting
}));

const { hasSeen, loadToursSeen, markSeen, resetToursSeen, toursSeen } =
  await import("$lib/tour/state/seen.svelte");

beforeEach(() => {
  vi.clearAllMocks();
  stored.value = null;
  toursSeen.loaded = false;
  toursSeen.ids = [];
});

describe("toursSeen", () => {
  it("starts empty when nothing was ever stored", async () => {
    await loadToursSeen();
    expect(toursSeen.loaded).toBe(true);
    expect(hasSeen("filters")).toBe(false);
  });

  it("stores a Tour once, however often it ends", async () => {
    await markSeen("filters");
    await markSeen("filters");
    expect(hasSeen("filters")).toBe(true);
    expect(stored.writeSetting).toHaveBeenCalledOnce();
    expect(stored.writeSetting).toHaveBeenCalledWith("toursSeen", ["filters"]);
  });

  it("forgets every Tour on reset", async () => {
    stored.value = ["filters"];
    await loadToursSeen();
    await resetToursSeen();
    expect(hasSeen("filters")).toBe(false);
    expect(stored.writeSetting).toHaveBeenCalledWith("toursSeen", []);
  });
});
