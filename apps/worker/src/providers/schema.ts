import { z } from "zod";
import { Card } from "@mobile-recipes/shared";
import { ProviderError } from "./types";

// Every provider is asked for exactly this shape, wrapped in an object — "v"
// is Worker-authored envelope metadata (see packages/shared/src/api.ts), not
// something a model needs to produce.
export const CardsPayload = z.object({
  cards: z.array(Card).length(5),
});
export type CardsPayload = z.infer<typeof CardsPayload>;

// Shared by every provider: parse the model's raw text/object output and
// validate it against CardsPayload, or throw a ProviderError that index.ts
// turns into a 502. One place this can go wrong instead of one per provider.
export function parseCardsPayload(providerName: string, raw: unknown): Card[] {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ProviderError(providerName, "response was not valid JSON", raw);
    }
  }

  const parsed = CardsPayload.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderError(providerName, "response did not match the card schema", parsed.error.flatten());
  }
  return parsed.data.cards;
}
