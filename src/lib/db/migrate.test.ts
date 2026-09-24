import BetterSqlite from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  journalMigrations,
  migrate,
  MigrationError,
  NewerDatabaseError,
  type Journal,
  type Migration,
  type MigrationDriver
} from "./migrate";

function driver(sqlite: BetterSqlite.Database): MigrationDriver {
  return {
    execute: async (sql) => sqlite.exec(sql),
    userVersion: async () => sqlite.pragma("user_version", { simple: true }) as number
  };
}

function tables(sqlite: BetterSqlite.Database): string[] {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

const createA: Migration = { version: 1, tag: "0000_a", sql: "CREATE TABLE a (id text);" };
const createB: Migration = {
  version: 2,
  tag: "0001_b",
  sql: "CREATE TABLE b (id text);\n--> statement-breakpoint\nCREATE TABLE c (id text);"
};

describe("migrate", () => {
  it("runs every migration on a fresh database and records the version", async () => {
    const sqlite = new BetterSqlite(":memory:");
    expect(await migrate(driver(sqlite), [createA, createB])).toBe(2);
    expect(tables(sqlite)).toEqual(["a", "b", "c"]);
    expect(sqlite.pragma("user_version", { simple: true })).toBe(2);
  });

  it("runs only the migrations above the current version", async () => {
    const sqlite = new BetterSqlite(":memory:");
    await migrate(driver(sqlite), [createA]);
    const before = vi.fn(async () => {});
    await migrate(driver(sqlite), [createA, createB], before);
    expect(tables(sqlite)).toEqual(["a", "b", "c"]);
    expect(before).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("skips the hook when nothing is pending", async () => {
    const sqlite = new BetterSqlite(":memory:");
    await migrate(driver(sqlite), [createA]);
    const before = vi.fn(async () => {});
    expect(await migrate(driver(sqlite), [createA], before)).toBe(1);
    expect(before).not.toHaveBeenCalled();
  });

  it("leaves a failed migration unapplied and keeps the ones before it", async () => {
    const sqlite = new BetterSqlite(":memory:");
    const broken: Migration = {
      version: 2,
      tag: "0001_broken",
      sql: "CREATE TABLE b (id text);\n--> statement-breakpoint\nNOT SQL;"
    };
    await expect(migrate(driver(sqlite), [createA, broken])).rejects.toBeInstanceOf(MigrationError);
    expect(tables(sqlite)).toEqual(["a"]);
    expect(sqlite.pragma("user_version", { simple: true })).toBe(1);
  });

  it("refuses a database newer than the migrations it knows", async () => {
    const sqlite = new BetterSqlite(":memory:");
    sqlite.pragma("user_version = 3");
    await expect(migrate(driver(sqlite), [createA])).rejects.toBeInstanceOf(NewerDatabaseError);
    expect(tables(sqlite)).toEqual([]);
  });
});

describe("journalMigrations", () => {
  it("rejects a journal with a gap", () => {
    const journal: Journal = {
      entries: [
        { idx: 0, tag: "a" },
        { idx: 2, tag: "c" }
      ]
    };
    expect(() => journalMigrations(journal, () => "")).toThrow(/expected 1/);
  });

  it("rejects a missing file", () => {
    const journal: Journal = { entries: [{ idx: 0, tag: "a" }] };
    expect(() => journalMigrations(journal, () => undefined)).toThrow(/a\.sql is missing/);
  });

  it("builds the schema from the shipped migrations", async () => {
    const dir = join(import.meta.dirname, "migrations");
    const journal: Journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8"));
    const migrations = journalMigrations(journal, (tag) =>
      readFileSync(join(dir, `${tag}.sql`), "utf8")
    );
    const sqlite = new BetterSqlite(":memory:");
    await migrate(driver(sqlite), migrations);
    expect(tables(sqlite)).toEqual(["comparisons", "groups", "projects", "tree_settings"]);
  });
});
