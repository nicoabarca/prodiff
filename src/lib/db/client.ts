import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

// DDL is derived from schema.ts and run idempotently at startup.
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

export type SqlExecute = (sql: string) => Promise<unknown>;

/** Creates every table through any SQLite driver. Idempotent. */
export async function ensureSchema(execute: SqlExecute) {
  await execute(createTableSql(schema.projects));
  await execute(createTableSql(schema.groups));
  await execute(createTableSql(schema.comparisons));
  await execute(createTableSql(schema.treeSettings));
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;
let initPromise: Promise<Db> | null = null;

/** The initialized database. `initDb()` runs once in the root layout's `load()`. */
export function db(): Db {
  if (!instance) throw new Error("db not initialized — initDb() runs in +layout.ts load()");
  return instance;
}

export function initDb(): Promise<Db> {
  if (!initPromise) {
    initPromise = (async () => {
      const sqlite = await Database.load("sqlite:prodiff.db");
      await ensureSchema((sql) => sqlite.execute(sql));

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
