import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { seedItems } from "@mobile-recipes/shared";
import { items, savedRecipes } from "./schema";

const sqlite = openDatabaseSync("recipes.db");
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
      saved_at INTEGER NOT NULL,
      cooked_count INTEGER NOT NULL DEFAULT 0,
      last_cooked_at INTEGER
    );
  `);
  // Milestones 1–3 already created saved_recipes (without these two columns)
  // on real devices; ADD COLUMN backfills them there. No-op on a fresh
  // install, where CREATE TABLE above already included them — the
  // "duplicate column" error is expected and harmless in that case.
  for (const stmt of [
    `ALTER TABLE saved_recipes ADD COLUMN cooked_count INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE saved_recipes ADD COLUMN last_cooked_at INTEGER;`,
  ]) {
    try {
      sqlite.execSync(stmt);
    } catch {
      // column already exists
    }
  }

  const alreadySeeded = db.select().from(items).limit(1).all().length > 0;
  if (!alreadySeeded) {
    db.insert(items).values(seedItems).run();
  }
}
