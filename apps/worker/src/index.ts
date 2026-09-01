import { SuggestRequest } from "@mobile-recipes/shared";
import { activeProvider, ProviderError } from "./providers";
import { generateImage, imageKeyFor } from "./images";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/suggest") {
      return handleSuggest(request, env);
    }
    if (request.method === "GET" && url.pathname.startsWith("/img/")) {
      return handleImage(request, env, url.pathname.slice("/img/".length));
    }
    return jsonError(404, "not found");
  },
} satisfies ExportedHandler<Env>;

async function handleSuggest(request: Request, env: Env): Promise<Response> {
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
    // Never call FLUX here — this just builds the URL the client will
    // request once it's ready to show the image. The card itself (title,
    // badges, missing-ingredient flag) must render immediately; actual
    // generation-or-cache-hit happens lazily in handleImage below, and only
    // when the client asks for it. See CLAUDE.md's Image pipeline section.
    const cardsWithImages = cards.map((card) => ({
      ...card,
      imageUrl: `${origin}/img/${imageKeyFor(card.title)}?prompt=${encodeURIComponent(card.imagePrompt)}`,
    }));
    return Response.json({ v: 1, cards: cardsWithImages });
  } catch (err) {
    if (err instanceof ProviderError) {
      return jsonError(502, `${err.provider}: ${err.message}`, err.detail);
    }
    throw err;
  }
}

const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

async function handleImage(request: Request, env: Env, key: string): Promise<Response> {
  const cached = await env.RECIPE_IMAGES.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: { "content-type": "image/jpeg", "cache-control": IMAGE_CACHE_CONTROL },
    });
  }

  const prompt = new URL(request.url).searchParams.get("prompt");
  if (!prompt) {
    return jsonError(404, "image not cached, and no prompt query param to generate it");
  }

  let bytes: Uint8Array;
  try {
    bytes = await generateImage(env, prompt);
  } catch (err) {
    return jsonError(502, "image generation failed", err instanceof Error ? err.message : err);
  }

  await env.RECIPE_IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });

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

function jsonError(status: number, error: string, detail?: unknown): Response {
  return Response.json({ error, ...(detail !== undefined ? { detail } : {}) }, { status });
}
