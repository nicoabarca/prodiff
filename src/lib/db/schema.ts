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

/** Groups belong to a project and are deleted with it. Null `stats` means not applied yet. */
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

/** What the Comparison Directed Tree is built from. The tree itself is never cached. */
export const treeSettings = sqliteTable("tree_settings", {
  projectId: text("project_id").primaryKey(),
  attributes: text("attributes", { mode: "json" }).$type<TreeSettings["attributes"]>().notNull(),
  selectedVariants: text("selected_variants", { mode: "json" })
    .$type<TreeSettings["selectedVariants"]>()
    .notNull()
});
