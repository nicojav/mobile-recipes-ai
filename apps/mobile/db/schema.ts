import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const savedRecipes = sqliteTable("saved_recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  card: text("card").notNull(), // full card JSON, so the saved list never re-fetches
  savedAt: integer("saved_at").notNull(),
});
