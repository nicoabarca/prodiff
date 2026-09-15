import path from "node:path";
import { mkdirSync } from "node:fs";
import type { TauriCapabilities, TauriServiceOptions } from "@wdio/tauri-service";
import { ensureBinary } from "./helpers/build.ts";
import { wipeAppData } from "./helpers/app-data.ts";
import { REPO_ROOT, binaryPath, target } from "./helpers/target.ts";

const profile = target();
const ARTIFACTS_DIR = path.join(REPO_ROOT, "e2e/.artifacts");

const capability: TauriCapabilities = {
  browserName: "tauri",
  "tauri:options": { application: binaryPath(profile) }
};

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,

  services: [["@wdio/tauri-service", { driverProvider: "embedded" } satisfies TauriServiceOptions]],
  capabilities: [capability],

  logLevel: "warn",
  waitforTimeout: 10_000,
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  reporters: ["spec"],

  onPrepare() {
    ensureBinary(profile);
  },

  // Every spec file starts from an empty app data dir: no SQLite database, no Projects.
  beforeSession() {
    wipeAppData();
  },

  // The service polls window focus before each `$`, `getTitle` and click through
  // `tauri-plugin-wdio`, which is not installed, so every poll waits out a 5 s timeout.
  // An explicit `switchToWindow` turns that polling off for the session.
  async before() {
    await browser.switchToWindow(await browser.getWindowHandle());
  },

  async afterTest(test, _context, { passed }) {
    if (passed) return;
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const name = `${test.parent} ${test.title}`.replace(/[^a-zA-Z0-9-]+/g, "-");
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, `${name}.png`));
  }
};
