import { mkdirSync } from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { REPO_ROOT, binaryPath } from "../helpers/target.ts";
import { click, installCursor, moveTo } from "./helpers/cursor.ts";
import { pidOf, startRecording, stopRecording } from "./helpers/recorder.ts";
import { blackSeconds, encodeGif, encodeVideo } from "./helpers/encode.ts";

const OUT_DIR = path.join(REPO_ROOT, "e2e/.artifacts/demo");
const RAW = path.join(OUT_DIR, "raw.mov");

const WINDOW = { width: 1600, height: 1000 };

const REQUEST_DOCUMENTS_PATH = "Start/Submit application/Check completeness/Request documents";

const anchor = (name: string, key?: string) =>
  $(key ? `[data-tour="${name}"][data-tour-key="${key}"]` : `[data-tour="${name}"]`);

const beat = (ms = 1500) => browser.pause(ms);

// Marks every Tour as seen, so none starts on its own during the recording. The Tour
// state loads when a Project first opens, so this runs before that.
async function skipTours(): Promise<void> {
  const error = await browser.executeAsync<string | null, []>((done) => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: Function } })
      .__TAURI_INTERNALS__;
    internals
      .invoke("plugin:sql|execute", {
        db: "sqlite:prodiff.db",
        query: "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('toursSeen', $1)",
        values: [JSON.stringify(["statistics", "filters", "tree", "distributions", "dfg"])]
      })
      .then(
        () => done(null),
        (error: unknown) => done(String(error))
      );
  });
  if (error) throw new Error(`[demo] could not mark Tours seen: ${error}`);
}

describe("demo", () => {
  before(async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    await browser.setWindowRect(null, null, WINDOW.width, WINDOW.height);
    await browser.waitUntil(
      async () => (await browser.execute(() => window.innerWidth)) === WINDOW.width
    );
    await $("button*=sample").waitForDisplayed();
    await skipTours();
    await installCursor();
    await beat(250);
    const frame = await browser.getWindowRect();
    const view = await browser.execute(() => ({ width: innerWidth, height: innerHeight }));
    const webview = { top: frame.height - view.height, ...view };
    await startRecording(pidOf(binaryPath("release")), webview, RAW);
  });

  it("walks through the Sample Project", async () => {
    await beat(500);

    // Home: create the Sample Project.
    await click($("button*=sample"));
    await anchor("comparison-charts").waitForDisplayed({ timeout: 60_000 });
    await beat(1250);

    // Statistics: the figures side by side.
    await moveTo(anchor("metrics-table"));
    await beat(1000);

    // Filters: apply Slow cases.
    await click(anchor("nav-filters"));
    await anchor("group-card", "Slow cases").waitForDisplayed();
    await beat(750);
    await moveTo(anchor("group-card", "Slow cases"));
    await beat(400);
    await click($('[data-tour-key="Slow cases"] [data-tour="apply-group"]'));
    await $('[data-tour-key="Slow cases"] [data-tour="apply-group"]').waitForExist({
      reverse: true,
      timeout: 60_000
    });
    await beat(1000);

    // Tree: pick Request documents.
    await click(anchor("nav-tree"));
    await anchor("tree-node", REQUEST_DOCUMENTS_PATH).waitForDisplayed({ timeout: 60_000 });
    await beat(1250);
    await click(anchor("tree-node", REQUEST_DOCUMENTS_PATH));
    await anchor("tree-detail-panel").waitForDisplayed();
    await beat(1500);

    // Distributions for that step.
    await click(anchor("open-distributions"));
    await anchor("distribution-grid").waitForDisplayed({ timeout: 60_000 });
    await beat(1750);

    // Directly-Follows Graph: pick Request documents.
    await click(anchor("nav-dfg"));
    await anchor("dfg-node", "Request documents").waitForDisplayed({ timeout: 60_000 });
    await beat(1000);
    await click(anchor("dfg-node", "Request documents"));
    await anchor("dfg-detail-panel").waitForDisplayed();
    await beat(1750);
  });

  after(async () => {
    if (!(await stopRecording())) return;
    const black = blackSeconds(RAW);
    if (black > 0) console.warn(`[demo] ${black} s of the recording are black; record again`);
    encodeVideo(RAW, path.join(OUT_DIR, "prodiff-demo"), WINDOW.width);
    encodeGif(RAW, path.join(OUT_DIR, "prodiff-demo.gif"), 1200, 15);
    console.log(`[demo] wrote ${OUT_DIR}/prodiff-demo.{mp4,webm,gif}`);
  });
});
