import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  // JSON-encoded ColumnMapping[]. Not Drizzle's built-in blob(json) mapper —
  // that calls Buffer.from() unconditionally, which doesn't exist in this
  // browser/webview runtime. Stringify/parse by hand, same as hiddenColumns.
  columns: text("columns").notNull(),
  hiddenColumns: text("hidden_columns").notNull(), // JSON-encoded string[]
  events: integer("events").notNull(),
  cases: integer("cases").notNull(),
  activities: integer("activities").notNull(),
  variants: integer("variants").notNull(),
  timespanStart: text("timespan_start"),
  timespanEnd: text("timespan_end"),
  createdAt: text("created_at").notNull()
});
