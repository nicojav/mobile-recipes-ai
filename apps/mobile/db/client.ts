import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { seedItems } from "@cocina/shared";
import { items, savedRecipes } from "./schema";

const sqlite = openDatabaseSync("cocina.db");
export const db = drizzle(sqlite, { schema: { items, savedRecipes } });

export function initDb() {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS saved_recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      card TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );
  `);

  const alreadySeeded = db.select().from(items).limit(1).all().length > 0;
  if (!alreadySeeded) {
    db.insert(items).values(seedItems).run();
  }
}
