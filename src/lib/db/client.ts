import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { migrations } from "./bundled-migrations";
import { prepareDatabaseBackup } from "./invokers/prepare-database-backup";
import { migrate, MigrationError, NewerDatabaseError } from "./migrate";
import type { DbProblem } from "./types";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;
let initPromise: Promise<Db> | null = null;
let backupPath: string | null = null;

export function dbProblem(error: unknown): DbProblem {
  if (error instanceof NewerDatabaseError) return { kind: "newer" };
  if (error instanceof MigrationError) {
    return { kind: "migration", message: error.message, backupPath };
  }
  return { kind: "other", message: String(error) };
}

/** The initialized database. `initDb()` runs once in the root layout's `load()`. */
export function db(): Db {
  if (!instance) throw new Error("db not initialized — initDb() runs in +layout.ts load()");
  return instance;
}

export function initDb(): Promise<Db> {
  if (!initPromise) {
    initPromise = (async () => {
      const sqlite = await Database.load("sqlite:prodiff.db");
      await migrate(
        {
          execute: (sql) => sqlite.execute(sql),
          userVersion: async () =>
            (await sqlite.select<{ user_version: number }[]>("PRAGMA user_version"))[0].user_version
        },
        migrations,
        async (from) => {
          if (from === 0) return;
          const path = await prepareDatabaseBackup(from);
          await sqlite.execute(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
          backupPath = path;
        }
      );

      instance = drizzle(
        async (sql, params, method) => {
          if (method === "run") {
            await sqlite.execute(sql, params);
            return { rows: [] };
          }
          const rows = await sqlite.select<Record<string, unknown>[]>(sql, params);
          return { rows: rows.map((row) => Object.values(row)) };
        },
        { schema }
      );
      return instance;
    })();
  }
  return initPromise;
}
