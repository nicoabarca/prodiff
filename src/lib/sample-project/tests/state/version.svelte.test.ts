import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ value: null as number | null }));

vi.mock("$lib/db/app-settings", () => ({
  readSetting: async () => stored.value,
  writeSetting: async (_key: string, value: number) => {
    stored.value = value;
  }
}));

const { SAMPLE_VERSION } = await import("$lib/sample-project/manifest");
const { loadSampleVersion, recordSampleVersion, sampleOutdated, sampleVersion } =
  await import("$lib/sample-project/state/version.svelte");

beforeEach(() => {
  stored.value = null;
  sampleVersion.loaded = false;
  sampleVersion.value = null;
});

describe("sampleOutdated", () => {
  it("says nothing until the recorded version is loaded", () => {
    expect(sampleOutdated()).toBe(false);
  });

  it("holds for a Sample Project with no recorded version", async () => {
    await loadSampleVersion();
    expect(sampleOutdated()).toBe(true);
  });

  it("holds for one created from an older version", async () => {
    stored.value = SAMPLE_VERSION - 1;
    await loadSampleVersion();
    expect(sampleOutdated()).toBe(true);
  });

  it("clears once the current version is recorded", async () => {
    await loadSampleVersion();
    await recordSampleVersion();
    expect(sampleOutdated()).toBe(false);
    expect(stored.value).toBe(SAMPLE_VERSION);
  });
});
