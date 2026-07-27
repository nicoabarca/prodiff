import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

// Single source of truth is schema.ts — DDL is derived from it so the two
// never drift apart. No drizzle-kit/migrations here: every table is generated
// idempotently (CREATE TABLE IF NOT EXISTS) on every startup.
function createTableSql(table: Parameters<typeof getTableConfig>[0]): string {
  const { name, columns } = getTableConfig(table);
  const columnDefs = columns.map((column) => {
    const parts = [column.name, column.getSQLType()];
    if (column.primary) parts.push("PRIMARY KEY");
    if (column.notNull) parts.push("NOT NULL");
    return parts.join(" ");
  });
  return `CREATE TABLE IF NOT EXISTS ${name} (\n  ${columnDefs.join(",\n  ")}\n);`;
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;
let initPromise: Promise<Db> | null = null;

/**
 * The initialized database. `initDb()` runs once in the root layout's `load()`,
 * which SvelteKit awaits before any route renders — so callers never have to
 * know about initialization ordering.
 */
export function db(): Db {
  if (!instance) throw new Error("db not initialized — initDb() runs in +layout.ts load()");
  return instance;
}

export function initDb(): Promise<Db> {
  if (!initPromise) {
    initPromise = (async () => {
      const sqlite = await Database.load("sqlite:procept.db");
      await sqlite.execute(createTableSql(schema.projects));
      await sqlite.execute(createTableSql(schema.slices));

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
