import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { TauriCapabilities, TauriServiceOptions } from "@wdio/tauri-service";
import { build } from "../helpers/build.ts";
import { wipeAppData } from "../helpers/app-data.ts";
import { REPO_ROOT, binaryPath } from "../helpers/target.ts";

const ARTIFACTS_DIR = path.join(REPO_ROOT, "e2e/.artifacts/demo");

// Recordings run the release binary, so Polars work reads as it does for users. It is
// built only when missing; rebuild it with `E2E_TARGET=release pnpm e2e:build`.
const capability: TauriCapabilities = {
  browserName: "tauri",
  "tauri:options": { application: binaryPath("release") }
};

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./*.demo.ts"],
  maxInstances: 1,

  services: [["@wdio/tauri-service", { driverProvider: "embedded" } satisfies TauriServiceOptions]],
  capabilities: [capability],

  logLevel: "warn",
  waitforTimeout: 30_000,
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 300_000 },
  reporters: ["spec"],

  onPrepare() {
    if (!existsSync(binaryPath("release"))) build("release");
    wipeAppData();
  },

  async before() {
    await browser.switchToWindow(await browser.getWindowHandle());
  },

  async afterHook(_test, _context, { passed }) {
    if (passed) return;
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "failed-hook.png"));
  },

  async afterTest(_test, _context, { passed }) {
    if (passed) return;
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "failed-test.png"));
  }
};
