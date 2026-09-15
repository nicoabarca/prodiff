import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

// DDL is derived from schema.ts and run idempotently at startup. Additive columns
// are applied after their tables exist so installed databases gain new settings.
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

async function addColumnIfMissing(
  sqlite: Database,
  table: string,
  column: string,
  definition: string
) {
  const columns = await sqlite.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  if (!columns.some((known) => known.name === column)) {
    await sqlite.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
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
      const sqlite = await Database.load("sqlite:compare.db");
      await sqlite.execute(createTableSql(schema.projects));
      await sqlite.execute(createTableSql(schema.groups));
      await sqlite.execute(createTableSql(schema.comparisons));
      await sqlite.execute(createTableSql(schema.treeSettings));
      await sqlite.execute(createTableSql(schema.dfgSettings));
      await addColumnIfMissing(
        sqlite,
        "tree_settings",
        "attributes_chosen",
        "attributes_chosen integer NOT NULL DEFAULT 0"
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
