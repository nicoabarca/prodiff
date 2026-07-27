import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ColumnMapping } from "$lib/column-mapping";
import type { Filter } from "$lib/filters";
import type { EventLogStats, SliceKind } from "$lib/types";

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
