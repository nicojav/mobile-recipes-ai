import { SuggestRequest, type Card, type CardWithImage } from "@mobile-recipes/shared";
import { cardsFromCorpus, saveToCorpus } from "./corpus";
import { activeProvider, ProviderError } from "./providers";
import { ensureImage, ImageGenerationSkipped, imageKeyFor, imageUsageSnapshot } from "./images";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/suggest") {
      return handleSuggest(request, env, ctx);
    }
    if (request.method === "GET" && url.pathname.startsWith("/img/")) {
      return handleImage(request, env, url.pathname.slice("/img/".length));
    }
    // Dev-only debug aid (see images.ts) — no auth/rate limit, same as
    // /img/, since it costs nothing and returns no sensitive data, just an
    // aggregate count. Worth reconsidering if this project ever deploys to
    // a real production environment, which — per CLAUDE.md's Build order —
    // it deliberately hasn't yet.
    if (request.method === "GET" && url.pathname === "/debug/image-usage") {
      return Response.json(imageUsageSnapshot(env));
    }
    return jsonError(404, "not found");
  },
} satisfies ExportedHandler<Env>;

async function handleSuggest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Cheapest checks first — reject before any JSON parsing or provider/image
  // work reaches the paid-per-call parts of the pipeline. See CLAUDE.md
  // "Abuse protection".
  if (!(await hasValidAppSecret(request, env))) {
    return jsonError(401, "missing or invalid X-App-Secret header");
  }

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success: withinRateLimit } = await env.SUGGEST_RATE_LIMITER.limit({ key: clientIp });
  if (!withinRateLimit) {
    return jsonError(429, "too many requests");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const parsedRequest = SuggestRequest.safeParse(body);
  if (!parsedRequest.success) {
    return jsonError(400, "request does not match SuggestRequest", parsedRequest.error.flatten());
  }

  const suggestRequest = parsedRequest.data;
  const origin = new URL(request.url).origin;

  try {
    const cards = await activeProvider.generateCards(suggestRequest, env);
    // Record what was actually generated for the fallback corpus. Off the
    // response path and never fatal — a failed write just means one dish
    // doesn't get remembered. See corpus.ts.
    ctx.waitUntil(
      saveToCorpus(env, cards, suggestRequest.category).catch((corpusErr) => {
        console.error("[corpus] save failed", corpusErr);
      }),
    );
    return Response.json({ v: 1, cards: attachImages(env, ctx, origin, cards), source: "live" });
  } catch (err) {
    if (err instanceof ProviderError) {
      // Logged unconditionally — without this, wrangler's console only shows
      // the bare status line, and a rate limit vs. a real upstream failure
      // are indistinguishable from the outside. See CLAUDE.md's Free tier
      // ceilings note on Groq's 8,000 tokens/min cap being the likely cause
      // of a fast 429 here.
      console.error(`[${err.provider}] status=${err.status ?? "?"} retryAfter=${err.retryAfter ?? "none"}`, err.detail);

      // Live generation is degraded — serve previously-generated dishes
      // instead, but only for a genuine upstream outage (429 or 5xx). A
      // validation/parse failure has no status and stays a plain 502, since
      // the client's own retry usually fixes it. Cuisine picks never fall
      // back: the corpus has no cuisine tag, so it would answer "Japón" with
      // Argentine dishes. If nothing in the corpus clears the match floor we
      // fall through to the original error, so the client's backoff still
      // applies. See corpus.ts.
      const isOutage = err.status === 429 || (err.status !== undefined && err.status >= 500);
      if (isOutage && suggestRequest.cuisine === undefined) {
        try {
          const cards = await cardsFromCorpus(env, suggestRequest);
          if (cards.length > 0) {
            console.warn(`[corpus] served ${cards.length} card(s) after ${err.provider} status=${err.status}`);
            return Response.json({ v: 1, cards: attachImages(env, ctx, origin, cards), source: "corpus" });
          }
        } catch (corpusErr) {
          console.error("[corpus] fallback failed", corpusErr);
        }
      }

      if (err.status === 429) {
        return jsonError(429, `${err.provider}: rate limited`, err.detail, err.retryAfter ? { "retry-after": err.retryAfter } : undefined);
      }
      return jsonError(502, `${err.provider}: ${err.message}`, err.detail);
    }
    throw err;
  }
}

// Never await FLUX on the response path — the card itself (title, badges,
// missing-ingredient flag) must render immediately. The URL is built
// synchronously; generation-or-cache-hit happens in ensureImage, kicked off
// via ctx.waitUntil so it starts without blocking this response, and again
// (deduped) whenever the client actually requests the URL in handleImage.
// See CLAUDE.md's Image pipeline section. Shared by live and corpus-served
// cards — a corpus card's image is usually already in R2, making the warm a
// cheap cache hit.
function attachImages(env: Env, ctx: ExecutionContext, origin: string, cards: Card[]): CardWithImage[] {
  return cards.map((card) => {
    const key = imageKeyFor(card.dishKey);
    ctx.waitUntil(
      ensureImage(env, key, card.imagePrompt).catch(() => {
        // A failed early warm just means handleImage generates it fresh
        // when the client actually requests the URL — never fatal here.
      }),
    );
    return {
      ...card,
      imageUrl: `${origin}/img/${key}?prompt=${encodeURIComponent(card.imagePrompt)}`,
    };
  });
}

const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

async function handleImage(request: Request, env: Env, key: string): Promise<Response> {
  const prompt = new URL(request.url).searchParams.get("prompt");
  if (!prompt) {
    // No prompt to fall back on if this key was never warmed — that only
    // happens for a stale/hand-typed URL, not the normal flow (the Worker
    // always attaches ?prompt= — see handleSuggest above).
    const cached = await env.RECIPE_IMAGES.get(key);
    if (!cached) {
      return jsonError(404, "image not cached, and no prompt query param to generate it");
    }
    return new Response(cached.body, {
      headers: { "content-type": "image/jpeg", "cache-control": IMAGE_CACHE_CONTROL },
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await ensureImage(env, key, prompt);
  } catch (err) {
    if (err instanceof ImageGenerationSkipped) {
      // Deliberately not attempted (dev toggle or known-exhausted quota),
      // not an upstream failure — see plans/adr/0001-dev-image-generation-toggle.md.
      // The app's Bowl-icon placeholder already handles a missing image
      // permanently, so the card still works, just without a picture.
      return jsonError(404, "image not available", err.reason);
    }
    return jsonError(502, "image generation failed", err instanceof Error ? err.message : err);
  }

  return new Response(bytes, {
    headers: { "content-type": "image/jpeg", "cache-control": IMAGE_CACHE_CONTROL },
  });
}

// The app's copy of this value ships inside the APK (there's no way around
// that for a client-side secret) — its job is blocking casual scraping, not
// being cryptographically unbreakable. Real protection is that it's not the
// Groq/Gemini key itself. Compared with a timing-safe check anyway since the
// cost of doing so is negligible.
async function hasValidAppSecret(request: Request, env: Env): Promise<boolean> {
  const provided = request.headers.get("X-App-Secret");
  if (!provided) return false;
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(env.APP_SECRET);
  if (providedBytes.byteLength !== expectedBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(providedBytes, expectedBytes);
}

function jsonError(status: number, error: string, detail?: unknown, headers?: Record<string, string>): Response {
  return Response.json({ error, ...(detail !== undefined ? { detail } : {}) }, { status, headers });
}
