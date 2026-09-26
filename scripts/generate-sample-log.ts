/**
 * Writes the Sample Project's Event Log to the resource the app bundles.
 *
 *   pnpm sample:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSampleLog } from "./sample-log";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_LOG_PATH = join(
  REPO_ROOT,
  "src-tauri",
  "resources",
  "sample-project",
  "loan-applications.csv"
);

mkdirSync(dirname(SAMPLE_LOG_PATH), { recursive: true });
const csv = generateSampleLog();
writeFileSync(SAMPLE_LOG_PATH, csv);
console.log(`Wrote ${csv.split("\n").length - 2} events to ${SAMPLE_LOG_PATH}`);
