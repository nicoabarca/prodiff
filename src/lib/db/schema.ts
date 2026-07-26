import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ColumnMapping } from "$lib/column-mapping";

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
