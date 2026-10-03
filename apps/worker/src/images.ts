import { ImageQuotaExceededError, imageProviders, type ImageProvider } from "./image-providers";

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

// Per-provider "out until" timestamps (ms). A quota error marks a provider
// exhausted until the next UTC midnight, when Cloudflare's daily allocation
// resets; transient errors never set this. In-memory per isolate: a fresh
// isolate may waste one failing call re-learning it, which isn't worth a
// KV/D1 binding to avoid. Replaces a single sticky boolean that was only
// cleared by a later success — which could never happen once the provider was
// being skipped.
const exhaustedUntil = new Map<string, number>();

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function isExhausted(provider: ImageProvider, now: number): boolean {
  const until = exhaustedUntil.get(provider.name);
  if (until === undefined) return false;
  if (now >= until) {
    exhaustedUntil.delete(provider.name);
    return false;
  }
  return true;
}

export interface ImageUsageSnapshot {
  generatedThisSession: number;
  estimatedDailyLimit: number;
  // True when every provider in the chain is currently marked exhausted.
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
  const now = Date.now();
  return {
    generatedThisSession,
    estimatedDailyLimit: ESTIMATED_DAILY_IMAGE_LIMIT,
    quotaExceeded: imageProviders.every((p) => isExhausted(p, now)),
    devGenerationSkipped: isDevGenerationSkipped(env),
  };
}

// Thrown instead of generating when generation was deliberately not
// attempted — the dev toggle above, or every provider known-exhausted (see
// generateViaChain below). handleImage answers this with 404 ("no image
// available"), not 502 ("upstream error") — the Worker chose not to attempt,
// it didn't fail unexpectedly.
export class ImageGenerationSkipped extends Error {
  constructor(public readonly reason: "dev-toggle" | "quota-exceeded") {
    super(`image generation skipped (${reason})`);
  }
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

  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        return await generateViaChain(env, key, imagePrompt);
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}

// Tries each provider in order, skipping any known-exhausted for today
// instead of repeating a guaranteed-failing round trip. A quota error marks
// that provider out and falls through to the next; any other error also falls
// through, and the last one is rethrown if nothing succeeds. If no provider
// produced an image and every one is exhausted, that's a deliberate "no image
// available", not an upstream failure.
async function generateViaChain(env: Env, key: string, imagePrompt: string): Promise<Uint8Array> {
  let lastError: unknown;
  for (const provider of imageProviders) {
    const now = Date.now();
    if (isExhausted(provider, now)) continue;
    try {
      const bytes = await provider.generate(env, imagePrompt);
      generatedThisSession++;
      // `source` lets a lower-quality fallback image be found and replaced by
      // hand later; there's deliberately no auto-upgrade job.
      await env.RECIPE_IMAGES.put(key, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: { source: provider.name },
      });
      return bytes;
    } catch (err) {
      if (err instanceof ImageQuotaExceededError) {
        exhaustedUntil.set(provider.name, nextUtcMidnight(now));
      }
      lastError = err;
    }
  }
  if (lastError === undefined || imageProviders.every((p) => isExhausted(p, Date.now()))) {
    throw new ImageGenerationSkipped("quota-exceeded");
  }
  throw lastError;
}
