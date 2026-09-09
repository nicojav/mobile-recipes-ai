import { SuggestRequest } from "@mobile-recipes/shared";
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

  try {
    const cards = await activeProvider.generateCards(parsedRequest.data, env);
    const origin = new URL(request.url).origin;
    // Never await FLUX on the response path — the card itself (title,
    // badges, missing-ingredient flag) must render immediately. The URL is
    // built synchronously; generation-or-cache-hit happens in ensureImage,
    // kicked off below via ctx.waitUntil so it starts without blocking this
    // response, and again (deduped) whenever the client actually requests
    // the URL in handleImage. See CLAUDE.md's Image pipeline section.
    const cardsWithImages = cards.map((card) => {
      const key = imageKeyFor(card.title);
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
    return Response.json({ v: 1, cards: cardsWithImages });
  } catch (err) {
    if (err instanceof ProviderError) {
      // Logged unconditionally — without this, wrangler's console only shows
      // the bare status line, and a rate limit vs. a real upstream failure
      // are indistinguishable from the outside. See CLAUDE.md's Free tier
      // ceilings note on Groq's 8,000 tokens/min cap being the likely cause
      // of a fast 429 here.
      console.error(`[${err.provider}] status=${err.status ?? "?"} retryAfter=${err.retryAfter ?? "none"}`, err.detail);
      if (err.status === 429) {
        return jsonError(429, `${err.provider}: rate limited`, err.detail, err.retryAfter ? { "retry-after": err.retryAfter } : undefined);
      }
      return jsonError(502, `${err.provider}: ${err.message}`, err.detail);
    }
    throw err;
  }
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
