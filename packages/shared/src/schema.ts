import { z } from "zod";

// Values stay in Spanish deliberately — they're the user's own words for where
// things live in the kitchen, and they go to the model as-is. Only the property
// key ("location") is English.
export const Location = z.enum([
  "freezer",
  "heladera",
  "alacena",
  "condimentos",
  "cajon",
]);
export type Location = z.infer<typeof Location>;

export const Item = z.object({
  id: z.string(),
  name: z.string(),
  location: Location,
  active: z.boolean().default(true),
  // Which pantry(s) an item shows up in — Mi cocina and Repostería are two
  // views over the same `items` table (see CLAUDE.md-equivalent ticket
  // "Baking pantry data model"), not two independent lists: a shared item
  // like huevos just has both flags true, so toggling it in one screen is
  // reflected in the other. `location` stays required for every item even
  // though Repostería's own pantry page renders flat, no location grouping.
  inCocina: z.boolean().default(true),
  inReposteria: z.boolean().default(false),
});
export type Item = z.infer<typeof Item>;
