import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/slices/invokers/types";
import type { SliceKind } from "$lib/slices/types";
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
  stats: text("stats", { mode: "json" }).$type<ResponseEventLogStats | null>(),
  statsKey: text("stats_key")
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
