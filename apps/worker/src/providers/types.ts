import type { Card, SuggestRequest } from "@mobile-recipes/shared";

export interface CardProvider {
  readonly name: string;
  generateCards(request: SuggestRequest, env: Env): Promise<Card[]>;
}

// Thrown by a provider for anything on its side going wrong (HTTP error,
// missing text part, response that doesn't parse or validate). index.ts
// catches this and turns it into a 502 without caring which provider it was.
export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
