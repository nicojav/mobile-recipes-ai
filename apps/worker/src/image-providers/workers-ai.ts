import { ImageQuotaExceededError, type ImageProvider } from "./types";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// One retry beyond the initial attempt. Observed in dev trace data: a
// flux-1-schnell call fails outright under concurrent load (5 cards' worth of
// generation firing near-simultaneously from handleSuggest's ctx.waitUntil
// warm plus the client's own Image.prefetch), with no r2_put ever happening —
// then a request for the exact same key moments later succeeds cleanly. The
// client (expo-image) never retries a failed load on its own, so without this
// the card is stuck on its placeholder forever even though the dish would
// generate fine a moment later. Not retried on a quota-exceeded error —
// there are no neurons left today, so retrying just adds latency for the
// same guaranteed failure.
const GENERATION_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Matches Workers AI's own error code for this condition (confirmed against
// the real error text: "4006: you have used up your daily free allocation of
// 10,000 neurons...") rather than the English sentence, which Cloudflare
// could reword without changing the code.
function isQuotaExceededError(err: unknown): boolean {
  return err instanceof Error && /\b4006\b/.test(err.message);
}

// flux-1-schnell has no width/height input (always 1024x1024, matching
// CLAUDE.md's free-tier neuron accounting) and returns base64-encoded JPEG in
// an `image` field — verified against Cloudflare's current model docs.
async function generateOnce(env: Env, imagePrompt: string): Promise<Uint8Array> {
  try {
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: imagePrompt });
    if (!result.image) {
      throw new Error("flux-1-schnell response had no image field");
    }
    return base64ToBytes(result.image);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new ImageQuotaExceededError("workers-ai", err instanceof Error ? err.message : undefined);
    }
    throw err;
  }
}

export const workersAiImageProvider: ImageProvider = {
  name: "workers-ai",
  async generate(env, imagePrompt) {
    try {
      return await generateOnce(env, imagePrompt);
    } catch (err) {
      if (err instanceof ImageQuotaExceededError) throw err;
      await delay(GENERATION_RETRY_DELAY_MS);
      return generateOnce(env, imagePrompt);
    }
  },
};
