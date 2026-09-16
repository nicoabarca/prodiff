import path from "node:path";

export type Target = "debug" | "release";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

export const E2E_IDENTIFIER = "com.nicoabarca.compare.e2e";

export const CARGO_TARGET_DIR = path.join(REPO_ROOT, "src-tauri/target/e2e");

export function target(): Target {
  const value = process.env.E2E_TARGET ?? "debug";
  if (value !== "debug" && value !== "release") {
    throw new Error(`E2E_TARGET must be "debug" or "release", got "${value}"`);
  }
  return value;
}

export function binaryPath(profile: Target): string {
  const name = process.platform === "win32" ? "compare.exe" : "compare";
  return path.join(CARGO_TARGET_DIR, profile, name);
}
