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
      active INTEGER NOT NULL DEFAULT 1,
      in_cocina INTEGER NOT NULL DEFAULT 1,
      in_reposteria INTEGER NOT NULL DEFAULT 0
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
  // "duplicate column" error is expected and harmless in that case. Same
  // deal for items' in_cocina/in_reposteria, added for Repostería — the
  // migration only adds the columns (existing rows land with the defaults
  // below: already in Mi cocina, not yet in Repostería), it doesn't
  // reclassify any existing row. See ticket "Baking pantry data model".
  for (const stmt of [
    `ALTER TABLE saved_recipes ADD COLUMN cooked_count INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE saved_recipes ADD COLUMN last_cooked_at INTEGER;`,
    `ALTER TABLE items ADD COLUMN in_cocina INTEGER NOT NULL DEFAULT 1;`,
    `ALTER TABLE items ADD COLUMN in_reposteria INTEGER NOT NULL DEFAULT 0;`,
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
  } else {
    // Backfill rows added to seed.ts after this device was first seeded —
    // e.g. every Repostería-only ingredient (manteca, azúcar, ...). Seed ids
    // are stable slugs, so this only ever inserts what's genuinely missing;
    // it never touches an item the user has since edited or deleted. The 4
    // items reclassified as shared (harina leudante, harina 0000, huevos,
    // leche) already exist here and aren't in this diff, so — per "Baking
    // pantry data model" — they stay Mi-cocina-only on devices seeded before
    // this change; only a fresh install gets them shared automatically.
    const existingIds = new Set(db.select({ id: items.id }).from(items).all().map((row) => row.id));
    const missing = seedItems.filter((item) => !existingIds.has(item.id));
    if (missing.length > 0) {
      db.insert(items).values(missing).run();
    }
  }
}
