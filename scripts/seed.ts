/**
 * Seeds a development app with the Event Logs in `scripts/seed_log/`.
 *
 *   pnpm seed [slug…] [--app-id <id> | --app-data-dir <dir>]
 *
 * Each `<slug>.csv` is paired with a `<slug>.json` manifest holding
 * `{ name, columns, hiddenColumns, groups? }`. With no slugs, every pair is
 * seeded. The Project id is derived from the slug, so seeding a slug again
 * resets that Project: its files are replaced and its Groups, comparison and
 * tree settings are deleted.
 *
 * Each entry of `groups` is `{ name, color?, filters }`, where `filters` is a
 * Filter List in the exact JSON the app stores. The Groups are applied in array
 * order, which is also their position. `case_not_in_group` is not supported.
 */
import BetterSqlite from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { v5 as uuidv5 } from "uuid";
import { ensureSchema } from "../src/lib/db/client";
import * as schema from "../src/lib/db/schema";
import type {
  RequestColumnMapping,
  ResponseCreateEventLog
} from "../src/lib/event-log/invokers/types";
import type { Project } from "../src/lib/event-log/types";
import type { Filter } from "../src/lib/filters/kind/filter";
import { defaultColor } from "../src/lib/groups/colors";
import type { ResponseEventLogStats } from "../src/lib/groups/invokers/types";
import type { Group } from "../src/lib/groups/types";
import { groupId } from "../src/lib/groups/utils/group-id";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_LOG_DIR = join(REPO_ROOT, "scripts", "seed_log");
const CARGO_MANIFEST = join(REPO_ROOT, "src-tauri", "Cargo.toml");
const SEED_BIN = join(
  REPO_ROOT,
  "src-tauri",
  "target",
  "release",
  platform() === "win32" ? "seed-project.exe" : "seed-project"
);

interface ManifestGroup {
  name: string;
  color?: string;
  filters: Filter[];
}

interface Manifest {
  name: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
  groups?: ManifestGroup[];
}

interface Seeded {
  eventLog: ResponseCreateEventLog;
  groups: ResponseEventLogStats[];
}

interface SeedInput {
  slug: string;
  id: string;
  csvPath: string;
  projectDir: string;
  manifest: Manifest;
  groups: (ManifestGroup & { id: string })[];
}

interface Args {
  appId: string | null;
  appDataDir: string | null;
  slugs: string[];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { appId: null, appDataDir: null, slugs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--app-id" || arg === "--app-data-dir") {
      const value = argv[++i];
      if (!value) fail(`${arg} needs a value.`);
      if (arg === "--app-id") args.appId = value;
      else args.appDataDir = value;
    } else if (arg.startsWith("--")) {
      fail(`Unknown option ${arg}.`);
    } else {
      args.slugs.push(arg);
    }
  }
  if (args.appId && args.appDataDir) fail("Pass --app-id or --app-data-dir, not both.");
  return args;
}

/** The identifier `scripts/dev-port.sh` gives the current branch. */
function branchAppId(): string {
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  }).stdout.trim();
  if (!branch) fail("Cannot derive a development app id from a detached HEAD; pass --app-id.");
  return `com.nicoabarca.compare.dev-${branch.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

function defaultAppDataDir(appId: string): string {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", appId);
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), appId);
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), appId);
}

/** Every slug with both a CSV and a manifest. */
function availableSlugs(): string[] {
  return readdirSync(SEED_LOG_DIR)
    .filter((file) => file.endsWith(".csv"))
    .map((file) => basename(file, ".csv"))
    .filter((slug) => existsSync(join(SEED_LOG_DIR, `${slug}.json`)))
    .sort();
}

function buildSeeder() {
  const build = spawnSync(
    "cargo",
    ["build", "--release", "--bin", "seed-project", "--manifest-path", CARGO_MANIFEST],
    { stdio: "inherit" }
  );
  if (build.status !== 0) fail("Building seed-project failed.");
}

/** Imports the Event Log and applies `groups` to it, in one pass. */
function seedProject(
  projectDir: string,
  csvPath: string,
  columns: RequestColumnMapping[],
  groups: { id: string; filters: Filter[] }[]
) {
  const run = spawnSync(SEED_BIN, [projectDir, csvPath], {
    input: JSON.stringify({ columns, groups }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (run.status !== 0) throw new Error(run.stderr.trim() || `exited with ${run.status}`);
  return JSON.parse(run.stdout) as Seeded;
}

function seedInput(slug: string, available: string[], appDataDir: string): SeedInput {
  if (!available.includes(slug)) {
    throw new Error(`No ${slug}.csv with a matching ${slug}.json in ${SEED_LOG_DIR}.`);
  }
  const csvPath = join(SEED_LOG_DIR, `${slug}.csv`);
  const manifest = JSON.parse(readFileSync(join(SEED_LOG_DIR, `${slug}.json`), "utf8")) as Manifest;
  const unsupported = manifest.groups?.find((group) =>
    group.filters.some((filter) => filter.kind === "case_not_in_group")
  );
  if (unsupported) throw new Error(`Group "${unsupported.name}" uses unsupported case_not_in_group.`);
  const id = uuidv5(`compare:seed:${slug}`, uuidv5.URL);
  return {
    slug,
    id,
    csvPath,
    projectDir: join(appDataDir, "projects", id),
    manifest,
    groups: (manifest.groups ?? []).map((group) => ({ ...group, id: groupId() }))
  };
}

function moveProjectAside(projectDir: string): string | null {
  if (!existsSync(projectDir)) return null;
  const backupDir = join(dirname(projectDir), `.${basename(projectDir)}-seed-backup-${randomUUID()}`);
  renameSync(projectDir, backupDir);
  return backupDir;
}

function restoreProject(projectDir: string, backupDir: string | null) {
  rmSync(projectDir, { recursive: true, force: true });
  if (backupDir) renameSync(backupDir, projectDir);
}

function discardProjectBackup(backupDir: string | null) {
  if (!backupDir) return;
  try {
    rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Seeded Project but could not remove backup ${backupDir}: ${String(error)}`);
  }
}

function replaceProject<T>(projectDir: string, work: () => T): T {
  const backupDir = moveProjectAside(projectDir);
  let result: T;
  try {
    result = work();
  } catch (error) {
    try {
      restoreProject(projectDir, backupDir);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], "Seeding failed and could not restore the Project.");
    }
    throw error;
  }
  discardProjectBackup(backupDir);
  return result;
}

function seededProject(input: SeedInput, result: ResponseCreateEventLog): Project {
  return {
    id: input.id,
    name: input.manifest.name,
    fileName: basename(input.csvPath),
    originalPath: result.originalPath,
    eventLogPath: result.eventLogPath,
    columns: input.manifest.columns,
    hiddenColumns: input.manifest.hiddenColumns,
    events: result.events,
    cases: result.cases,
    activities: result.activities,
    variants: result.variants,
    timespanStart: result.timespanStart,
    timespanEnd: result.timespanEnd,
    createdAt: new Date().toISOString()
  };
}

function seededGroups(input: SeedInput, stats: ResponseEventLogStats[]): Group[] {
  const now = new Date().toISOString();
  return input.groups.map((group, position) => ({
    id: group.id,
    projectId: input.id,
    name: group.name,
    color: group.color ?? defaultColor(position),
    position,
    filters: group.filters,
    stats: stats[position],
    createdAt: now,
    editedAt: now
  }));
}

function persistSeed(
  db: BetterSQLite3Database<typeof schema>,
  project: Project,
  groups: Group[]
) {
  const { id, ...changes } = project;
  db.transaction((tx) => {
    tx.delete(schema.groups).where(eq(schema.groups.projectId, id)).run();
    tx.delete(schema.comparisons).where(eq(schema.comparisons.projectId, id)).run();
    tx.delete(schema.treeSettings).where(eq(schema.treeSettings.projectId, id)).run();
    tx.insert(schema.projects)
      .values(project)
      .onConflictDoUpdate({ target: schema.projects.id, set: changes })
      .run();
    if (groups.length > 0) tx.insert(schema.groups).values(groups).run();
  });
}

function seedSlug(slug: string, available: string[], appDataDir: string, db: BetterSQLite3Database<typeof schema>) {
  const input = seedInput(slug, available, appDataDir);
  return replaceProject(input.projectDir, () => {
    const seeded = seedProject(
      input.projectDir,
      input.csvPath,
      input.manifest.columns,
      input.groups.map(({ id, filters }) => ({ id, filters }))
    );
    const project = seededProject(input, seeded.eventLog);
    const groups = seededGroups(input, seeded.groups);
    persistSeed(db, project, groups);
    return { project, groups };
  });
}

function seedAll(
  slugs: string[],
  available: string[],
  appDataDir: string,
  db: BetterSQLite3Database<typeof schema>
) {
  const failures: string[] = [];
  console.log(`App data: ${appDataDir}`);
  for (const slug of slugs) {
    try {
      const { project, groups } = seedSlug(slug, available, appDataDir, db);

      console.log(
        `seeded  ${slug}: ${project.name} (${project.id}), ` +
          `${project.cases.toLocaleString("en")} cases, ${project.events.toLocaleString("en")} events, ` +
          `${groups.length} Groups`
      );
    } catch (error) {
      failures.push(slug);
      console.error(`failed  ${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${slugs.length - failures.length} of ${slugs.length} logs seeded.`);
  console.log("Reload the app if it is open to see the seeded Projects.");
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDataDir = resolve(args.appDataDir ?? defaultAppDataDir(args.appId ?? branchAppId()));
  const available = availableSlugs();
  const slugs = args.slugs.length > 0 ? args.slugs : available;
  if (slugs.length === 0) fail(`No seed logs found in ${SEED_LOG_DIR}.`);

  buildSeeder();
  mkdirSync(appDataDir, { recursive: true });
  const sqlite = new BetterSqlite(join(appDataDir, "compare.db"));
  const db = drizzle(sqlite, { schema });
  await ensureSchema(async (sql) => sqlite.exec(sql));
  const failures = seedAll(slugs, available, appDataDir, db);
  sqlite.close();
  if (failures.length > 0) process.exit(1);
}

main();
