import { z } from "zod";

// A full batch is 5 cards. The first batch of a session is split into
// FIRST_PAINT_COUNT + (CARD_COUNT - FIRST_PAINT_COUNT) — a Groq workaround,
// not the design of choice. See CLAUDE.md "Decisions already made" for why,
// and for when to delete the split.
export const CARD_COUNT = 5;
export const FIRST_PAINT_COUNT = 2;

// Field keys are English (structural, never shown to the user); the location
// fields' *names* match Location's values, which stay Spanish. String values
// throughout are whatever language they naturally are — the user's own
// ingredient words here, the model's rioplatense Spanish in the response.
export const SuggestRequest = z.object({
  v: z.literal(1),
  freezer: z.array(z.string()),
  heladera: z.array(z.string()),
  alacena: z.array(z.string()),
  cajon: z.array(z.string()),
  // Prose, not an array — see CLAUDE.md API contract: separate entries push
  // the model toward listing ingredients instead of thinking about dishes.
  condimentos: z.string(),
  notes: z.string().optional(),
  exclude: z.array(z.string()).optional(),
  // How many cards to generate this call. Optional and defaults to
  // CARD_COUNT server-side — only the client's two-phase first load ever
  // sends anything else. Clamped again in the Worker; never trust a client
  // number without re-checking it server-side.
  count: z.number().int().min(1).max(CARD_COUNT).optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequest>;

export const Effort = z.enum(["easy", "medium", "elaborate"]);
export type Effort = z.infer<typeof Effort>;

export const Ingredient = z.object({
  name: z.string(),
  quantity: z.string(),
  have: z.boolean(),
});
export type Ingredient = z.infer<typeof Ingredient>;

// Exported (not inlined into SuggestResponse) because the Worker also uses it
// on its own to build Gemini's response schema and validate Gemini's raw
// output — one source of truth for the card shape on both sides.
export const Card = z.object({
  title: z.string(),
  description: z.string(),
  minutes: z.number(),
  effort: Effort,
  servings: z.number(),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  // English, describing the dish physically rather than naming it — see
  // CLAUDE.md's image pipeline section for why.
  imagePrompt: z.string(),
});
export type Card = z.infer<typeof Card>;

// The Worker attaches this after the LLM call returns — providers validate
// their raw output against Card (above), never CardWithImage, since no
// provider produces an image. Layered on top rather than a field on Card
// itself so the two validation targets can't drift into requiring the same
// thing at the wrong stage. See CLAUDE.md's Image pipeline section.
export const CardWithImage = Card.extend({
  imageUrl: z.string(),
});
export type CardWithImage = z.infer<typeof CardWithImage>;

export const SuggestResponse = z.object({
  v: z.literal(1),
  // Not .length(CARD_COUNT) — a request can ask for fewer (see `count` on
  // SuggestRequest, and the first-batch split under Prefetching in
  // CLAUDE.md).
  cards: z.array(CardWithImage).min(1).max(CARD_COUNT),
});
export type SuggestResponse = z.infer<typeof SuggestResponse>;
