// Generate per dish, not per card — recipes repeat constantly, so the R2 key
// is derived from "dishKey", not the creative "title". See CLAUDE.md's Image
// pipeline section and ADR 0002: slugify(title) used to miss the cache
// almost every time for the same dish, since Groq's non-deterministic
// sampling rarely reproduces the same title text twice. "dishKey" is the
// field the model is instructed to hold stable across calls for the same
// dish (see prompt.ts); "title" stays free to vary.
export function imageKeyFor(dishKey: string): string {
  const slug = dishKey
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}.jpg`;
}

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

async function generateImageOnce(env: Env, imagePrompt: string): Promise<Uint8Array> {
  const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: imagePrompt });
  if (!result.image) {
    throw new Error("flux-1-schnell response had no image field");
  }
  return base64ToBytes(result.image);
}

// Cache-miss path only — callers check R2 first (see index.ts's /img route)
// and only reach this when nothing's cached yet. flux-1-schnell has no
// width/height input (fixed at a 512x512 tile, matching CLAUDE.md's free-tier
// neuron accounting) and returns base64-encoded JPEG in an `image` field —
// verified against Cloudflare's current model docs, not assumed.
export async function generateImage(env: Env, imagePrompt: string): Promise<Uint8Array> {
  try {
    return await generateImageOnce(env, imagePrompt);
  } catch (err) {
    if (isQuotaExceededError(err)) throw err;
    await delay(GENERATION_RETRY_DELAY_MS);
    return generateImageOnce(env, imagePrompt);
  }
}

// In-flight generation dedupe, keyed by R2 key. Without this, the Worker's
// own early image warm (kicked off from handleSuggest via ctx.waitUntil) and
// the client's Image.prefetch hitting the same key moments later would each
// call FLUX and each `put` to R2. Per-isolate only — two isolates handling
// concurrent requests can still duplicate a generation, same as before this
// existed; this only removes the *guaranteed* duplicate within one isolate.
const inFlight = new Map<string, Promise<Uint8Array>>();

// Dev-only usage counter, so the daily Workers AI budget (see CLAUDE.md's
// Free tier ceilings — 10,000 neurons/day, ~57.6 neurons/image) is visible
// without digging through curl or wrangler's observability API, which is how
// the quota-exhaustion 502s during progressive-loading testing got diagnosed
// the first time. In-memory only, per isolate: it counts generations since
// this dev server last started, not Cloudflare's actual server-side quota
// (which persists across restarts and doesn't reset just because this
// counter did) — a during-this-session debug aid, not an authoritative
// ledger. Exposed via GET /debug/image-usage in index.ts; the client only
// shows it when __DEV__.
const NEURONS_PER_IMAGE = 57.6;
const DAILY_NEURON_BUDGET = 10_000;
export const ESTIMATED_DAILY_IMAGE_LIMIT = Math.floor(DAILY_NEURON_BUDGET / NEURONS_PER_IMAGE);

let generatedThisSession = 0;
// Sticky once true — cleared on the next successful generation, not on a
// non-quota failure, so a single unrelated FLUX error doesn't silently drop
// the "we're out for today" signal.
let quotaExceeded = false;

export interface ImageUsageSnapshot {
  generatedThisSession: number;
  estimatedDailyLimit: number;
  quotaExceeded: boolean;
  devGenerationSkipped: boolean;
}

// Local-dev-only escape hatch (see plans/adr/0001-dev-image-generation-toggle.md):
// set SKIP_IMAGE_GEN=true in apps/worker/.dev.vars, never deployed, to stop
// cache-miss FLUX calls from burning the shared daily quota while iterating
// on anything other than image fidelity itself. Cache hits are unaffected.
function isDevGenerationSkipped(env: Env): boolean {
  return env.SKIP_IMAGE_GEN === "true";
}

export function imageUsageSnapshot(env: Env): ImageUsageSnapshot {
  return {
    generatedThisSession,
    estimatedDailyLimit: ESTIMATED_DAILY_IMAGE_LIMIT,
    quotaExceeded,
    devGenerationSkipped: isDevGenerationSkipped(env),
  };
}

// Thrown instead of calling FLUX when generation was deliberately not
// attempted — the dev toggle above, or a known-exhausted quota (see the
// quotaExceeded short-circuit in ensureImage below). handleImage answers
// this with 404 ("no image available"), not 502 ("upstream error") — the
// Worker chose not to attempt, it didn't fail unexpectedly.
export class ImageGenerationSkipped extends Error {
  constructor(public readonly reason: "dev-toggle" | "quota-exceeded") {
    super(`image generation skipped (${reason})`);
  }
}

// Matches Workers AI's own error code for this condition (confirmed against
// the real error text: "4006: you have used up your daily free allocation of
// 10,000 neurons...") rather than the English sentence, which Cloudflare
// could reword without changing the code. Best-effort — this only feeds a
// debug counter, not anything correctness-critical.
function isQuotaExceededError(err: unknown): boolean {
  return err instanceof Error && /\b4006\b/.test(err.message);
}

// R2-check → generate → store, shared by handleImage's lazy path and the
// early warm path. Returns cached bytes on a hit; otherwise generates once
// per key even under concurrent callers.
export async function ensureImage(env: Env, key: string, imagePrompt: string): Promise<Uint8Array> {
  const cached = await env.RECIPE_IMAGES.get(key);
  if (cached) {
    return new Uint8Array(await cached.arrayBuffer());
  }

  if (isDevGenerationSkipped(env)) {
    throw new ImageGenerationSkipped("dev-toggle");
  }
  // Known-exhausted for today — skip the guaranteed-failing round trip
  // instead of repeating it on every subsequent cache miss. Cleared on the
  // next successful generation (see the flag's own comment above); a fresh
  // isolate also starts with this false, so it's self-healing across
  // recycles even though it isn't Cloudflare's authoritative quota state.
  if (quotaExceeded) {
    throw new ImageGenerationSkipped("quota-exceeded");
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const bytes = await generateImage(env, imagePrompt);
        generatedThisSession++;
        quotaExceeded = false;
        await env.RECIPE_IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
        return bytes;
      } catch (err) {
        if (isQuotaExceededError(err)) quotaExceeded = true;
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}
