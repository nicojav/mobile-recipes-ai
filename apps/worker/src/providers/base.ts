import type { Card, SuggestRequest } from "@mobile-recipes/shared";
import { parseCardsPayload } from "./schema";
import { ProviderError, type CardProvider } from "./types";

// Template Method: every provider differs only in how it calls its model and
// where the cards payload lives in that model's response shape — everything
// else (error wrapping, the "did we even get a payload" check, schema
// validation) is identical across all three, so it lives here once. A new
// provider implements exactly two methods and can't forget a step or handle
// one differently from the others.
export abstract class BaseCardProvider implements CardProvider {
  abstract readonly name: string;

  async generateCards(request: SuggestRequest, env: Env): Promise<Card[]> {
    let raw: unknown;
    try {
      raw = await this.callModel(request, env);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, "request failed", err instanceof Error ? err.message : err);
    }

    const payload = this.extractPayload(raw);
    if (payload === undefined || payload === null) {
      throw new ProviderError(this.name, "response missing expected payload", raw);
    }

    return parseCardsPayload(this.name, payload);
  }

  /**
   * Call the model and return its raw, provider-shaped response. Throw a
   * ProviderError directly to attach richer detail (e.g. a response body);
   * any other thrown error is wrapped generically by generateCards above.
   */
  protected abstract callModel(request: SuggestRequest, env: Env): Promise<unknown>;

  /** Pull the cards JSON (a string to parse, or an already-parsed object) out of the raw response. */
  protected abstract extractPayload(raw: unknown): unknown;
}
