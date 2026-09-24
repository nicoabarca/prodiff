/**
 * A migration drizzle-kit wrote. `version` is its position in the journal plus
 * one, and is what `PRAGMA user_version` holds once it has run; a fresh
 * database is at 0.
 */
export interface Migration {
  version: number;
  tag: string;
  sql: string;
}

export interface Journal {
  entries: { idx: number; tag: string }[];
}

/** A SQLite connection the runner can drive. The app and `scripts/seed.ts` each wrap their own driver. */
export interface MigrationDriver {
  execute(sql: string): Promise<unknown>;
  userVersion(): Promise<number>;
}

export class NewerDatabaseError extends Error {
  constructor(
    readonly version: number,
    readonly known: number
  ) {
    super(`The database is at version ${version}, and this build knows up to ${known}.`);
    this.name = "NewerDatabaseError";
  }
}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    cause: unknown
  ) {
    super(`Migration ${migration.tag} failed: ${String(cause)}`, { cause });
    this.name = "MigrationError";
  }
}

const BREAKPOINT = "--> statement-breakpoint";

/**
 * Orders drizzle-kit's migrations by `meta/_journal.json`. `read` returns the
 * SQL of `<tag>.sql`. Throws when the journal has a gap or a file is missing.
 */
export function journalMigrations(
  journal: Journal,
  read: (tag: string) => string | undefined
): Migration[] {
  return journal.entries.map((entry, position) => {
    if (entry.idx !== position) {
      throw new Error(
        `Migration journal entry ${entry.tag} has idx ${entry.idx}, expected ${position}.`
      );
    }
    const sql = read(entry.tag);
    if (sql === undefined) throw new Error(`Migration file ${entry.tag}.sql is missing.`);
    return { version: position + 1, tag: entry.tag, sql };
  });
}

/**
 * One migration as a single script, so it commits whole or not at all even
 * when the driver pools connections.
 */
export function migrationScript(migration: Migration): string {
  const statements = migration.sql.split(BREAKPOINT).join("\n");
  return `BEGIN;\n${statements}\nPRAGMA user_version = ${migration.version};\nCOMMIT;`;
}

/**
 * Runs every migration above the database's `user_version`, in order.
 * `beforeMigrating` runs once, with the version the database starts at, only
 * when something is pending. Returns the version the database ends at.
 */
export async function migrate(
  driver: MigrationDriver,
  migrations: Migration[],
  beforeMigrating?: (from: number) => Promise<void>
): Promise<number> {
  const known = migrations.length;
  const from = await driver.userVersion();
  if (from > known) throw new NewerDatabaseError(from, known);
  const pending = migrations.slice(from);
  if (pending.length === 0) return from;

  await beforeMigrating?.(from);
  for (const migration of pending) {
    try {
      await driver.execute(migrationScript(migration));
    } catch (cause) {
      await driver.execute("ROLLBACK").catch(() => {});
      throw new MigrationError(migration, cause);
    }
  }
  return known;
}
