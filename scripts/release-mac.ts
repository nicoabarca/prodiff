/**
 * Adds the Apple Silicon build to the draft release `pnpm release` started.
 *
 *   git checkout v<version>
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD=… pnpm release:mac
 *
 * Builds `.app` and `.dmg` for `aarch64-apple-darwin` with the release
 * identifier, adds the `darwin-aarch64` entries to the draft's `latest.json`
 * and uploads the `.dmg`, the updater archive and the new `latest.json`.
 * Publishing the draft stays manual; the command is printed at the end.
 *
 * The updater key is read from `TAURI_SIGNING_PRIVATE_KEY`, or else from
 * `~/.tauri/prodiff.key`. Refuses to run unless HEAD is the tag of the version
 * in `package.json`, the tree is clean, and the draft already holds the
 * `latest.json` CI uploads.
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "aarch64-apple-darwin";
const BUNDLE_DIR = join(REPO_ROOT, "src-tauri", "target", TARGET, "release", "bundle");
const KEY_FILE = join(homedir(), ".tauri", "prodiff.key");

interface UpdaterManifest {
  version: string;
  platforms: Record<string, { signature: string; url: string }>;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8", ...options });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed${result.stderr ? `:\n${result.stderr}` : "."}`);
  }
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function signingEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    if (!existsSync(KEY_FILE)) fail(`Set TAURI_SIGNING_PRIVATE_KEY or create ${KEY_FILE}.`);
    env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY_FILE, "utf8");
  }
  if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
    fail("Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD (empty if the key has no password).");
  }
  return env;
}

function main() {
  const version = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
  const tag = `v${version}`;
  const head = spawnSync("git", ["describe", "--exact-match", "--tags", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  }).stdout.trim();
  if (head !== tag) fail(`Check out ${tag} first: git checkout ${tag}`);
  if (run("git", ["status", "--porcelain"]) !== "") fail("Commit or discard your changes first.");

  const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  const assets = run("gh", ["release", "view", tag, "--json", "assets", "-q", ".assets[].name"]);
  if (!assets.split("\n").includes("latest.json")) {
    fail(`The draft ${tag} has no latest.json yet. Wait for the Windows build to finish.`);
  }

  const env = signingEnv();
  run(
    "pnpm",
    [
      "tauri",
      "build",
      "--config",
      "src-tauri/tauri.release.conf.json",
      "--bundles",
      "app,dmg",
      "--target",
      TARGET
    ],
    { env, stdio: "inherit" }
  );

  const archive = join(BUNDLE_DIR, "macos", "ProDiff.app.tar.gz");
  const dmg = join(BUNDLE_DIR, "dmg", `ProDiff_${version}_aarch64.dmg`);
  for (const file of [archive, `${archive}.sig`, dmg]) {
    if (!existsSync(file)) fail(`The build did not produce ${file}.`);
  }

  const scratch = mkdtempSync(join(tmpdir(), "prodiff-release-"));
  run("gh", ["release", "download", tag, "--pattern", "latest.json", "--dir", scratch]);
  const manifestPath = join(scratch, "latest.json");
  const manifest: UpdaterManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== version) {
    fail(`latest.json is for ${manifest.version}, expected ${version}.`);
  }
  const entry = {
    signature: readFileSync(`${archive}.sig`, "utf8"),
    url: `https://github.com/${repo}/releases/download/${tag}/ProDiff.app.tar.gz`
  };
  manifest.platforms["darwin-aarch64"] = entry;
  manifest.platforms["darwin-aarch64-app"] = entry;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  run("gh", ["release", "upload", tag, dmg, archive, manifestPath, "--clobber"], {
    stdio: "inherit"
  });

  console.log(`Added macOS to the draft ${tag}. Review it, then publish:`);
  console.log(`  gh release edit ${tag} --draft=false --latest`);
}

main();
