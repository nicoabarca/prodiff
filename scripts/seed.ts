/**
 * Seeds a development app with the Event Logs in `scripts/seed_log/`.
 *
 *   pnpm seed [slug…] [--app-id <id> | --app-data-dir <dir>]
 *
 * Each `<slug>.csv` is paired with a `<slug>.json` manifest holding
 * `{ name, columns, hiddenColumns, customAttributes?, groups? }`. With no slugs, every pair is
 * seeded. The Project id is derived from the slug, so seeding a slug again
 * resets that Project: its files are replaced and its Custom Attributes,
 * Groups, comparison and tree settings are deleted.
 *
 * Each entry of `customAttributes` is `{ name, formula }`, with the formula in
 * the text the app's editor writes. Their ids are generated on every run, so a
 * manifest Group cannot filter on one.
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
import { journalMigrations, migrate, type Journal } from "../src/lib/db/migrate";
import * as schema from "../src/lib/db/schema";
import type {
  RequestColumnMapping,
  ResponseCreateEventLog
} from "../src/lib/event-log/invokers/types";
import type { Project } from "../src/lib/event-log/types";
import { defaultColor } from "../src/lib/groups/colors";
import type { ResponseEventLogStats } from "../src/lib/groups/invokers/types";
import type { Group } from "../src/lib/groups/types";
import { groupId } from "../src/lib/groups/utils/group-id";
import type {
  RequestCustomAttribute,
  ResponseEmptyCount
} from "../src/lib/custom-attributes/invokers/types";
import type { CustomAttribute } from "../src/lib/custom-attributes/types";
import { customAttributeId } from "../src/lib/custom-attributes/utils/custom-attribute-id";
import { parseFormula } from "../src/lib/custom-attributes/utils/parser";
import { formulaColumnError, nameError } from "../src/lib/custom-attributes/utils/validate";

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

type ManifestGroup = Pick<Group, "name" | "filters"> & Partial<Pick<Group, "color">>;

type SeedGroup = ManifestGroup & Pick<Group, "id">;

type ManifestCustomAttribute = Pick<CustomAttribute, "name" | "formula">;

type SeedCustomAttribute = RequestCustomAttribute & { name: string; text: string };

interface Manifest {
  name: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
  customAttributes?: ManifestCustomAttribute[];
  groups?: ManifestGroup[];
}

interface Seeded {
  eventLog: ResponseCreateEventLog;
  customAttributes: ResponseEmptyCount[];
  groups: ResponseEventLogStats[];
}

interface SeedInput {
  slug: string;
  id: string;
  csvPath: string;
  projectDir: string;
  manifest: Manifest;
  customAttributes: SeedCustomAttribute[];
  groups: SeedGroup[];
}

interface SeedContext {
  appDataDir: string;
  available: string[];
  db: BetterSQLite3Database<typeof schema>;
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
  return `com.nicoabarca.prodiff.dev-${branch.replace(/[^a-zA-Z0-9]/g, "-")}`;
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

/**
 * Imports the Event Log into `projectDir`, writes its Custom Attributes and
 * applies `groups` to it, in one pass.
 */
function seedProject(
  projectDir: string,
  csvPath: string,
  columns: RequestColumnMapping[],
  customAttributes: RequestCustomAttribute[],
  groups: Pick<Group, "id" | "filters">[]
) {
  const run = spawnSync(SEED_BIN, [projectDir, csvPath], {
    input: JSON.stringify({ columns, customAttributes, groups }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (run.status !== 0) throw new Error(run.stderr.trim() || `exited with ${run.status}`);
  return JSON.parse(run.stdout) as Seeded;
}

function seedInput(slug: string, { available, appDataDir }: SeedContext): SeedInput {
  if (!available.includes(slug)) {
    throw new Error(`No ${slug}.csv with a matching ${slug}.json in ${SEED_LOG_DIR}.`);
  }
  const csvPath = join(SEED_LOG_DIR, `${slug}.csv`);
  const manifest = JSON.parse(readFileSync(join(SEED_LOG_DIR, `${slug}.json`), "utf8")) as Manifest;
  const unsupported = manifest.groups?.find((group) =>
    group.filters.some((filter) => filter.kind === "case_not_in_group")
  );
  if (unsupported)
    throw new Error(`Group "${unsupported.name}" uses unsupported case_not_in_group.`);
  const id = uuidv5(`prodiff:seed:${slug}`, uuidv5.URL);
  const scope = { id, columns: manifest.columns, hiddenColumns: manifest.hiddenColumns } as Project;
  const customAttributes: SeedCustomAttribute[] = [];
  for (const attribute of manifest.customAttributes ?? []) {
    const parsed = parseFormula(attribute.formula);
    const problem =
      nameError(
        attribute.name,
        scope,
        customAttributes.map(({ id, name }) => ({ id, name }) as CustomAttribute),
        null
      ) ?? (parsed.ok ? formulaColumnError(parsed.formula, scope) : parsed.error);
    if (problem || !parsed.ok) {
      throw new Error(`Custom attribute "${attribute.name}": ${problem}.`);
    }
    customAttributes.push({
      id: customAttributeId(),
      name: attribute.name,
      text: attribute.formula,
      formula: parsed.formula
    });
  }
  return {
    slug,
    id,
    csvPath,
    projectDir: join(appDataDir, "projects", id),
    manifest,
    customAttributes,
    groups: (manifest.groups ?? []).map((group) => ({ ...group, id: groupId() }))
  };
}

/** `.{project id}-seed-{suffix}`, beside `projectDir`. */
function siblingDir(projectDir: string, suffix: string): string {
  return join(dirname(projectDir), `.${basename(projectDir)}-seed-${suffix}`);
}

/**
 * Moves `staging` to `projectDir`, keeping the directory it replaces beside it.
 * Returns that directory, or null when there was none.
 */
function swapIntoPlace(staging: string, projectDir: string): string | null {
  const previous = existsSync(projectDir)
    ? siblingDir(projectDir, `previous-${randomUUID()}`)
    : null;
  if (previous) renameSync(projectDir, previous);
  try {
    renameSync(staging, projectDir);
  } catch (error) {
    if (previous) renameSync(previous, projectDir);
    throw error;
  }
  return previous;
}

function swapBack(projectDir: string, previous: string | null) {
  rmSync(projectDir, { recursive: true, force: true });
  if (previous) renameSync(previous, projectDir);
}

function discardPrevious(previous: string | null) {
  if (!previous) return;
  try {
    rmSync(previous, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Seeded Project but could not remove ${previous}: ${String(error)}`);
  }
}

/** `result` names files in the staging directory; the Project row names them in `input.projectDir`. */
function seededProject(input: SeedInput, result: ResponseCreateEventLog): Project {
  return {
    id: input.id,
    name: input.manifest.name,
    fileName: basename(input.csvPath),
    originalPath: join(input.projectDir, basename(result.originalPath)),
    eventLogPath: join(input.projectDir, basename(result.eventLogPath)),
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

function seededCustomAttributes(input: SeedInput, counts: ResponseEmptyCount[]): CustomAttribute[] {
  const now = new Date().toISOString();
  return input.customAttributes.map((attribute, position) => ({
    id: attribute.id,
    projectId: input.id,
    name: attribute.name,
    formula: attribute.text,
    position,
    emptyCount: counts.find((count) => count.id === attribute.id)?.empty ?? null,
    createdAt: now,
    editedAt: now
  }));
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

/**
 * Writes the Project, its Custom Attributes and its Groups, then runs
 * `placeFiles` in the same transaction, so a failed write leaves the previous
 * files in place.
 */
function persistSeed(
  db: BetterSQLite3Database<typeof schema>,
  project: Project,
  customAttributes: CustomAttribute[],
  groups: Group[],
  placeFiles: () => void
) {
  const { id, ...changes } = project;
  db.transaction((tx) => {
    tx.delete(schema.customAttributes).where(eq(schema.customAttributes.projectId, id)).run();
    tx.delete(schema.groups).where(eq(schema.groups.projectId, id)).run();
    tx.delete(schema.comparisons).where(eq(schema.comparisons.projectId, id)).run();
    tx.delete(schema.treeSettings).where(eq(schema.treeSettings.projectId, id)).run();
    tx.insert(schema.projects)
      .values(project)
      .onConflictDoUpdate({ target: schema.projects.id, set: changes })
      .run();
    if (customAttributes.length > 0) {
      tx.insert(schema.customAttributes).values(customAttributes).run();
    }
    if (groups.length > 0) tx.insert(schema.groups).values(groups).run();
    placeFiles();
  });
}

function seedSlug(slug: string, context: SeedContext) {
  const input = seedInput(slug, context);
  const staging = siblingDir(input.projectDir, "staging");
  rmSync(staging, { recursive: true, force: true });
  try {
    const imported = seedProject(
      staging,
      input.csvPath,
      input.manifest.columns,
      input.customAttributes.map(({ id, formula }) => ({ id, formula })),
      input.groups
    );
    const project = seededProject(input, imported.eventLog);
    const customAttributes = seededCustomAttributes(input, imported.customAttributes);
    const groups = seededGroups(input, imported.groups);
    let previous: string | null | undefined;
    try {
      persistSeed(context.db, project, customAttributes, groups, () => {
        previous = swapIntoPlace(staging, input.projectDir);
      });
    } catch (error) {
      if (previous === undefined) throw error;
      try {
        swapBack(input.projectDir, previous);
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          "Seeding failed and could not restore the Project."
        );
      }
      throw error;
    }
    discardPrevious(previous ?? null);
    return { project, customAttributes, groups };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function seedAll(slugs: string[], context: SeedContext) {
  const failures: string[] = [];
  console.log(`App data: ${context.appDataDir}`);
  for (const slug of slugs) {
    try {
      const { project, customAttributes, groups } = seedSlug(slug, context);

      console.log(
        `seeded  ${slug}: ${project.name} (${project.id}), ` +
          `${project.cases.toLocaleString("en")} cases, ${project.events.toLocaleString("en")} events, ` +
          `${customAttributes.length} Custom Attributes, ${groups.length} Groups`
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

/** The app's migrations, read from `src/lib/db/migrations/` the way `bundled-migrations.ts` bundles them. */
function repoMigrations() {
  const dir = join(REPO_ROOT, "src", "lib", "db", "migrations");
  const journal: Journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8"));
  return journalMigrations(journal, (tag) => readFileSync(join(dir, `${tag}.sql`), "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDataDir = resolve(args.appDataDir ?? defaultAppDataDir(args.appId ?? branchAppId()));
  const available = availableSlugs();
  const slugs = args.slugs.length > 0 ? args.slugs : available;
  if (slugs.length === 0) fail(`No seed logs found in ${SEED_LOG_DIR}.`);

  buildSeeder();
  mkdirSync(appDataDir, { recursive: true });
  const sqlite = new BetterSqlite(join(appDataDir, "prodiff.db"));
  const db = drizzle(sqlite, { schema });
  await migrate(
    {
      execute: async (sql) => sqlite.exec(sql),
      userVersion: async () => sqlite.pragma("user_version", { simple: true }) as number
    },
    repoMigrations()
  );
  const failures = seedAll(slugs, { appDataDir, available, db });
  sqlite.close();
  if (failures.length > 0) process.exit(1);
}

main();
