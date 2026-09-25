/** Why the database could not open. `backupPath` is the copy taken before the failed migration. */
export type DbProblem =
  | { kind: "newer" }
  | { kind: "migration"; message: string; backupPath: string | null }
  | { kind: "other"; message: string };
