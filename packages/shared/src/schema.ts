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
});
export type Item = z.infer<typeof Item>;
