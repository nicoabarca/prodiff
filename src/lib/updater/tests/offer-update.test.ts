import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.fn();
const toast = Object.assign(vi.fn(), { loading: vi.fn(), error: vi.fn() });

vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

const { offerUpdate } = await import("$lib/updater/offer-update");

describe("offerUpdate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays quiet when there is no newer release", async () => {
    check.mockResolvedValue(null);
    await offerUpdate();
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the check fails", async () => {
    check.mockRejectedValue(new Error("offline"));
    await offerUpdate();
    expect(toast).not.toHaveBeenCalled();
  });

  it("offers a newer release", async () => {
    check.mockResolvedValue({ version: "0.2.0", downloadAndInstall: vi.fn() });
    await offerUpdate();
    expect(toast).toHaveBeenCalledWith(
      "ProDiff 0.2.0 is available",
      expect.objectContaining({ action: expect.objectContaining({ label: "Install and restart" }) })
    );
  });
});
