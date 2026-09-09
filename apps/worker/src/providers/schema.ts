import { z } from "zod";
import { Card } from "@mobile-recipes/shared";
import { ProviderError } from "./types";

// Every provider is asked for exactly this shape, wrapped in an object — "v"
// is Worker-authored envelope metadata (see packages/shared/src/api.ts), not
// something a model needs to produce.
//
// Count-parameterized (not a single module-level constant) because every
// suggestion batch is split 2-then-3 — a Groq workaround, see CLAUDE.md
// "Decisions already made". Memoized per count since providers derive their
// JSON Schema from this at module load and only ever see FIRST_PAINT_COUNT,
// CARD_COUNT - FIRST_PAINT_COUNT, or (from the harness, whose scenario
// payloads omit `count`) CARD_COUNT itself.
const payloadSchemaCache = new Map<number, z.ZodType<{ cards: Card[] }>>();

export function cardsPayloadFor(count: number): z.ZodType<{ cards: Card[] }> {
  let schema = payloadSchemaCache.get(count);
  if (!schema) {
    schema = z.object({ cards: z.array(Card).length(count) });
    payloadSchemaCache.set(count, schema);
  }
  return schema;
}

// Shared by every provider: parse the model's raw text/object output and
// validate it against the schema for the requested count, or throw a
// ProviderError that index.ts turns into a 502. One place this can go wrong
// instead of one per provider.
export function parseCardsPayload(providerName: string, raw: unknown, count: number): Card[] {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ProviderError(providerName, "response was not valid JSON", raw);
    }
  }

  const parsed = cardsPayloadFor(count).safeParse(payload);
  if (!parsed.success) {
    throw new ProviderError(providerName, "response did not match the card schema", parsed.error.flatten());
  }
  return parsed.data.cards;
}
