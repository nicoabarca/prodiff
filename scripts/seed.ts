/**
 * Seeds a development app with the Event Logs in `scripts/seed_log/`.
 *
 *   pnpm seed [slug…] [--app-id <id> | --app-data-dir <dir>]
 *
 * Each `<slug>.csv` is paired with a `<slug>.json` manifest holding
 * `{ name, columns, hiddenColumns }`. With no slugs, every pair is seeded. The
 * Project id is derived from the slug, so seeding a slug again resets that
 * Project: its files are replaced and its Groups, comparison and tree settings
 * are deleted.
 */
import BetterSqlite from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_LOG_DIR = join(REPO_ROOT, "scripts", "seed_log");
const CARGO_MANIFEST = join(REPO_ROOT, "src-tauri", "Cargo.toml");
const IMPORTER_BIN = join(
  REPO_ROOT,
  "src-tauri",
  "target",
  "release",
  platform() === "win32" ? "import-event-log.exe" : "import-event-log"
);

interface Manifest {
  name: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
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

function buildImporter() {
  const build = spawnSync(
    "cargo",
    ["build", "--release", "--bin", "import-event-log", "--manifest-path", CARGO_MANIFEST],
    { stdio: "inherit" }
  );
  if (build.status !== 0) fail("Building import-event-log failed.");
}

function importEventLog(projectDir: string, csvPath: string, manifestPath: string) {
  const run = spawnSync(IMPORTER_BIN, [projectDir, csvPath, manifestPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (run.status !== 0) throw new Error(run.stderr.trim() || `exited with ${run.status}`);
  return JSON.parse(run.stdout) as ResponseCreateEventLog;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDataDir = resolve(args.appDataDir ?? defaultAppDataDir(args.appId ?? branchAppId()));
  const available = availableSlugs();
  const slugs = args.slugs.length > 0 ? args.slugs : available;
  if (slugs.length === 0) fail(`No seed logs found in ${SEED_LOG_DIR}.`);

  buildImporter();

  mkdirSync(appDataDir, { recursive: true });
  const sqlite = new BetterSqlite(join(appDataDir, "compare.db"));
  const db = drizzle(sqlite, { schema });
  const failures: string[] = [];

  await ensureSchema(async (sql) => sqlite.exec(sql));

  console.log(`App data: ${appDataDir}`);
  for (const slug of slugs) {
    try {
      if (!available.includes(slug)) {
        throw new Error(`No ${slug}.csv with a matching ${slug}.json in ${SEED_LOG_DIR}.`);
      }
      const csvPath = join(SEED_LOG_DIR, `${slug}.csv`);
      const manifestPath = join(SEED_LOG_DIR, `${slug}.json`);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      const id = uuidv5(`compare:seed:${slug}`, uuidv5.URL);
      const result = importEventLog(join(appDataDir, "projects", id), csvPath, manifestPath);

      const project: Project = {
        id,
        name: manifest.name,
        fileName: basename(csvPath),
        originalPath: result.originalPath,
        eventLogPath: result.eventLogPath,
        columns: manifest.columns,
        hiddenColumns: manifest.hiddenColumns,
        events: result.events,
        cases: result.cases,
        activities: result.activities,
        variants: result.variants,
        timespanStart: result.timespanStart,
        timespanEnd: result.timespanEnd,
        createdAt: new Date().toISOString()
      };
      const { id: _, ...changes } = project;
      db.transaction((tx) => {
        tx.delete(schema.groups).where(eq(schema.groups.projectId, id)).run();
        tx.delete(schema.comparisons).where(eq(schema.comparisons.projectId, id)).run();
        tx.delete(schema.treeSettings).where(eq(schema.treeSettings.projectId, id)).run();
        tx.insert(schema.projects)
          .values(project)
          .onConflictDoUpdate({ target: schema.projects.id, set: changes })
          .run();
      });

      console.log(
        `seeded  ${slug}: ${project.name} (${id}), ` +
          `${project.cases.toLocaleString("en")} cases, ${project.events.toLocaleString("en")} events`
      );
    } catch (error) {
      failures.push(slug);
      console.error(`failed  ${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  sqlite.close();

  console.log(`${slugs.length - failures.length} of ${slugs.length} logs seeded.`);
  console.log("Reload the app if it is open to see the seeded Projects.");
  if (failures.length > 0) process.exit(1);
}

main();
