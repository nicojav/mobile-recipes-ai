import type { Card, SuggestRequest } from "@mobile-recipes/shared";

export interface CardProvider {
  readonly name: string;
  generateCards(request: SuggestRequest, env: Env): Promise<Card[]>;
}

// Thrown by a provider for anything on its side going wrong (HTTP error,
// missing text part, response that doesn't parse or validate). index.ts
// catches this and turns it into a 502 — except a 429 (rate limit), which it
// forwards as-is along with retryAfter, so the client can back off correctly
// instead of pattern-matching an error body. See CLAUDE.md's note on Groq's
// 8,000 tokens/min cap under "Free tier ceilings".
export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public detail?: unknown,
    public status?: number,
    public retryAfter?: string | null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
