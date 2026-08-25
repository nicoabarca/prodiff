import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { TreeSettings } from "$lib/tree/types";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  originalPath: text("original_path").notNull(),
  eventLogPath: text("event_log_path").notNull(),
  columns: text("columns", { mode: "json" }).$type<RequestColumnMapping[]>().notNull(),
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
 * Groups belong to a project and are deleted with it (see `removeProject`).
 * The row is written before the Parquet it names, so a file without a row is
 * unreachable; `stats` is filled by the same pass that writes that file, which
 * makes a null one mean "not applied yet" rather than "not measured yet".
 */
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  filters: text("filters", { mode: "json" }).$type<Filter[]>().notNull(),
  stats: text("stats", { mode: "json" }).$type<ResponseEventLogStats | null>(),
  createdAt: text("created_at").notNull(),
  editedAt: text("edited_at").notNull()
});

/**
 * Which Groups the tree compares, per project. Its own table rather than a
 * column on `tree_settings`: every table is created idempotently at startup,
 * so a new one needs no migration where a new column would.
 *
 * The ids are ordered and hold one or two entries; `original` is the whole
 * Event Log, which is what a project with no Groups compares.
 */
export const comparisons = sqliteTable("comparisons", {
  projectId: text("project_id").primaryKey(),
  groupIds: text("group_ids", { mode: "json" }).$type<string[]>().notNull()
});

/**
 * What the Comparison Directed Tree is built from — the attributes to test and
 * the Variants to include. Its own table: every table is created idempotently
 * at startup, so a new one needs no migration where a new column would.
 *
 * The tree itself is not cached here; it lives in memory while the app is open.
 */
export const treeSettings = sqliteTable("tree_settings", {
  projectId: text("project_id").primaryKey(),
  attributes: text("attributes", { mode: "json" }).$type<TreeSettings["attributes"]>().notNull(),
  selectedVariants: text("selected_variants", { mode: "json" })
    .$type<TreeSettings["selectedVariants"]>()
    .notNull()
});
