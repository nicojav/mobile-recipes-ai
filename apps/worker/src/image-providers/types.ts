export interface ImageProvider {
  readonly name: string;
  generate(env: Env, imagePrompt: string): Promise<Uint8Array>;
}

// Thrown by a provider when its own daily/period allowance is used up, as
// opposed to a transient failure. images.ts marks that provider exhausted
// until the next UTC midnight and moves on to the next one in the chain.
export class ImageQuotaExceededError extends Error {
  constructor(
    public readonly provider: string,
    detail?: string,
  ) {
    super(`${provider} image quota exceeded${detail ? `: ${detail}` : ""}`);
    this.name = "ImageQuotaExceededError";
  }
}
