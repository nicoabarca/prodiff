import journal from "./migrations/meta/_journal.json";
import { journalMigrations } from "./migrate";

const files = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true
});

/** The migrations under `migrations/`, inlined into the bundle by Vite. */
export const migrations = journalMigrations(journal, (tag) => files[`./migrations/${tag}.sql`]);
