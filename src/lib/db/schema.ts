import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { ColumnMapping } from "$lib/column-mapping";
import type { Filter } from "$lib/filters";
import type { EventLogStats, SliceKind } from "$lib/types";
import type { TreeSettings } from "$lib/tree";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  originalPath: text("original_path").notNull(),
  eventLogPath: text("event_log_path").notNull(),
  columns: text("columns", { mode: "json" }).$type<ColumnMapping[]>().notNull(),
  hiddenColumns: text("hidden_columns", { mode: "json" }).$type<string[]>().notNull(),
  events: integer("events").notNull(),
  cases: integer("cases").notNull(),
  activities: integer("activities").notNull(),
  variants: integer("variants").notNull(),
  timespanStart: text("timespan_start"),
  timespanEnd: text("timespan_end"),
  createdAt: text("created_at").notNull()
});

/**
 * Slices belong to a project and are deleted with it (see `removeProject`).
 * `stats` and `stats_key` are a cache of the last computed figures, so
 * reopening a project doesn't re-run every chain.
 */
export const slices = sqliteTable("slices", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").$type<SliceKind>().notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  filters: text("filters", { mode: "json" }).$type<Filter[]>().notNull(),
  stats: text("stats", { mode: "json" }).$type<EventLogStats | null>(),
  statsKey: text("stats_key")
});

/**
 * What the Comparison Directed Tree is built from — the attributes to test and
 * how much of the log to cover. Its own table rather than columns on
 * `projects`: every table is created idempotently at startup, so a new table
 * needs no migration where a new column would.
 *
 * The tree itself is not cached here. It is megabytes of JSON, cheap to
 * rebuild, and lives in memory for as long as the app is open.
 */
export const treeSettings = sqliteTable("tree_settings", {
  projectId: text("project_id").primaryKey(),
  attributes: text("attributes", { mode: "json" }).$type<TreeSettings["attributes"]>().notNull(),
  coverage: real("coverage").notNull()
});
