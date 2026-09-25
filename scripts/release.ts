/**
 * Starts a release.
 *
 *   pnpm release <patch | minor | major | x.y.z>
 *
 * Sets the version in `package.json`, `src-tauri/Cargo.toml`,
 * `src-tauri/tauri.conf.json` and `src-tauri/Cargo.lock`, commits it on `main`,
 * tags it `v<version>` and pushes both. The tag starts `.github/workflows/build.yml`,
 * which builds Windows into a draft release; `pnpm release:mac` adds macOS.
 *
 * Refuses to run off `main`, with uncommitted changes, or when `main` differs
 * from `origin/main`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string, args: string[], cwd = REPO_ROOT): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

function nextVersion(current: string, bump: string): string {
  if (SEMVER.test(bump)) return bump;
  const match = SEMVER.exec(current);
  if (!match) fail(`The current version ${current} is not x.y.z.`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  fail("Usage: pnpm release <patch | minor | major | x.y.z>");
}

/** Replaces the first match of `pattern`, whose one group is the old version. */
function setVersion(path: string, pattern: RegExp, version: string) {
  const file = join(REPO_ROOT, path);
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) fail(`No version found in ${path}.`);
  writeFileSync(
    file,
    text.replace(pattern, (line, old: string) => line.replace(old, version))
  );
}

function main() {
  const bump = process.argv[2];
  if (!bump) fail("Usage: pnpm release <patch | minor | major | x.y.z>");

  if (run("git", ["branch", "--show-current"]) !== "main") fail("Release from main.");
  if (run("git", ["status", "--porcelain"]) !== "") fail("Commit or discard your changes first.");
  run("git", ["fetch", "origin", "main", "--tags"]);
  if (run("git", ["rev-parse", "HEAD"]) !== run("git", ["rev-parse", "origin/main"])) {
    fail("main differs from origin/main. Pull or push first.");
  }

  const current = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
  const version = nextVersion(current, bump);
  const tag = `v${version}`;
  if (run("git", ["tag", "--list", tag]) !== "") fail(`${tag} already exists.`);

  setVersion("package.json", /"version": "([^"]+)"/, version);
  setVersion("src-tauri/tauri.conf.json", /"version": "([^"]+)"/, version);
  setVersion("src-tauri/Cargo.toml", /^version = "([^"]+)"/m, version);
  run("cargo", ["update", "--workspace", "--offline"], join(REPO_ROOT, "src-tauri"));

  run("git", [
    "add",
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock"
  ]);
  run("git", ["commit", "-m", `chore(release): ${tag}`]);
  run("git", ["tag", tag]);
  run("git", ["push", "--atomic", "origin", "main", tag]);

  console.log(`Pushed ${current} -> ${version} and ${tag}.`);
  console.log("CI is building Windows into a draft release. Once it finishes, run:");
  console.log(`  git checkout ${tag} && pnpm release:mac`);
}

main();
