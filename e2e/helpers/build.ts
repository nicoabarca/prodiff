import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  CARGO_TARGET_DIR,
  E2E_IDENTIFIER,
  REPO_ROOT,
  binaryPath,
  target,
  type Target
} from "./target.ts";

// Builds the e2e binary with the `e2e` Cargo feature and the e2e identifier into CARGO_TARGET_DIR.
export function build(profile: Target): void {
  const args = ["tauri", "build", "--no-bundle", "--features", "e2e"];
  if (profile === "debug") args.push("--debug");
  args.push("--config", JSON.stringify({ identifier: E2E_IDENTIFIER }));

  console.log(`[e2e] building ${profile} binary into ${CARGO_TARGET_DIR}`);
  const result = spawnSync("pnpm", args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR }
  });
  if (result.status !== 0) {
    throw new Error(`[e2e] ${profile} build failed with exit code ${result.status}`);
  }
}

// Debug is built only when missing; release is rebuilt on every run.
export function ensureBinary(profile: Target): string {
  const binary = binaryPath(profile);
  if (profile === "release" || !existsSync(binary)) build(profile);
  return binary;
}

if (import.meta.filename === process.argv[1]) {
  build(target());
}
